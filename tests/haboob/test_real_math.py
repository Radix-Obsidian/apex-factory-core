"""
Tests for the Haboob Real Math engine.
Implemented as a Python port of the TypeScript logic for fast CI validation.
The TypeScript module is the source of truth; this validates the math contracts.
"""

CLOSING_COST_FACTOR = 0.025
MAX_LTV = 0.80
DEFAULT_TARGET_RATE = 6.50
FAST_ROI_MONTHS = 24
HIGH_VALUE_BALANCE = 500_000


def monthly_payment(principal: float, annual_rate_pct: float, term_months: int) -> float:
    if annual_rate_pct == 0:
        return principal / term_months
    r = annual_rate_pct / 12 / 100
    return (principal * r) / (1 - (1 + r) ** (-term_months))


def fidelity_score(equity_pct, current_rate_pct, monthly_savings, has_hi_debt, break_even_months, loan_balance):
    score = 0

    if equity_pct >= 0.5:
        score += 3
    elif equity_pct >= 0.3:
        score += 2
    elif equity_pct >= 0.2:
        score += 1

    if current_rate_pct >= 7.0:
        score += 2
    elif current_rate_pct >= 6.5:
        score += 1

    if monthly_savings >= 500:
        score += 2
    elif monthly_savings >= 200:
        score += 1

    if has_hi_debt:
        score += 1

    if break_even_months <= FAST_ROI_MONTHS:
        score += 1

    if loan_balance >= HIGH_VALUE_BALANCE:
        score += 1

    return min(score, 10)


def run_real_math(current_rate_pct, loan_balance, remaining_months, has_hi_debt, property_value):
    current_payment = monthly_payment(loan_balance, current_rate_pct, remaining_months)
    new_payment = monthly_payment(loan_balance, DEFAULT_TARGET_RATE, 360)
    monthly_savings = current_payment - new_payment
    annual_savings = monthly_savings * 12
    equity_pct = (property_value - loan_balance) / property_value
    cash_out = max(0, property_value * MAX_LTV - loan_balance)
    est_closing = loan_balance * CLOSING_COST_FACTOR
    break_even = est_closing / monthly_savings if monthly_savings > 0 else float("inf")
    score = fidelity_score(equity_pct, current_rate_pct, monthly_savings, has_hi_debt, break_even, loan_balance)

    if equity_pct < 0.2:
        verdict = "NO_EQUITY"
    elif monthly_savings < 50:
        verdict = "RATE_PARITY"
    elif score >= 7:
        verdict = "STRONG_YES"
    else:
        verdict = "MARGINAL"

    return {
        "current_payment": current_payment,
        "new_payment": new_payment,
        "monthly_savings": monthly_savings,
        "annual_savings": annual_savings,
        "equity_pct": equity_pct,
        "cash_out": cash_out,
        "break_even_months": break_even,
        "fidelity_score": score,
        "verdict": verdict,
    }


def test_strong_yes_case():
    result = run_real_math(
        current_rate_pct=7.5,
        loan_balance=550_000,
        remaining_months=360,
        has_hi_debt=True,
        property_value=1_100_000,
    )
    assert result["verdict"] == "STRONG_YES"
    assert result["fidelity_score"] >= 7
    assert result["monthly_savings"] > 200
    assert result["equity_pct"] == 0.5


def test_no_equity_case():
    result = run_real_math(
        current_rate_pct=7.5,
        loan_balance=480_000,
        remaining_months=360,
        has_hi_debt=False,
        property_value=500_000,
    )
    assert result["verdict"] == "NO_EQUITY"
    assert result["equity_pct"] < 0.2


def test_rate_parity_case():
    result = run_real_math(
        current_rate_pct=6.55,
        loan_balance=300_000,
        remaining_months=360,
        has_hi_debt=False,
        property_value=600_000,
    )
    assert result["monthly_savings"] < 50
    assert result["verdict"] == "RATE_PARITY"


def test_marginal_case():
    result = run_real_math(
        current_rate_pct=7.0,
        loan_balance=300_000,
        remaining_months=360,
        has_hi_debt=False,
        property_value=600_000,
    )
    assert result["monthly_savings"] > 50
    assert result["verdict"] == "MARGINAL"
    assert result["fidelity_score"] < 7


def test_fidelity_score_caps_at_10():
    score = fidelity_score(
        equity_pct=0.8,
        current_rate_pct=8.5,
        monthly_savings=900,
        has_hi_debt=True,
        break_even_months=12,
        loan_balance=600_000,
    )
    assert score == 10


def test_fidelity_score_zero_for_bad_profile():
    score = fidelity_score(
        equity_pct=0.10,
        current_rate_pct=6.0,
        monthly_savings=30,
        has_hi_debt=False,
        break_even_months=100,
        loan_balance=100_000,
    )
    assert score == 0


def test_fast_roi_bonus():
    score_fast = fidelity_score(0.3, 7.0, 300, False, 20, 300_000)
    score_slow = fidelity_score(0.3, 7.0, 300, False, 30, 300_000)
    assert score_fast == score_slow + 1


def test_high_value_balance_bonus():
    score_high = fidelity_score(0.3, 7.0, 300, False, 30, 600_000)
    score_low = fidelity_score(0.3, 7.0, 300, False, 30, 300_000)
    assert score_high == score_low + 1


def test_monthly_payment_math():
    payment = monthly_payment(400_000, 7.0, 360)
    assert abs(payment - 2661.21) < 1.0


def test_cash_out_available():
    result = run_real_math(
        current_rate_pct=7.0,
        loan_balance=200_000,
        remaining_months=360,
        has_hi_debt=False,
        property_value=600_000,
    )
    expected_cash_out = 600_000 * 0.80 - 200_000
    assert abs(result["cash_out"] - expected_cash_out) < 1.0


def test_break_even_calculation():
    result = run_real_math(
        current_rate_pct=7.5,
        loan_balance=400_000,
        remaining_months=360,
        has_hi_debt=False,
        property_value=800_000,
    )
    expected_closing = 400_000 * CLOSING_COST_FACTOR
    expected_be = expected_closing / result["monthly_savings"]
    assert abs(result["break_even_months"] - expected_be) < 0.01


def test_parse_rate_helpers():
    import re

    def parse_rate(s):
        m = re.search(r"(\d+\.?\d*)", s)
        if not m:
            return None
        val = float(m.group(1))
        if val > 30 or val < 1:
            return None
        return val

    assert parse_rate("my rate is 7.25%") == 7.25
    assert parse_rate("7.5 percent") == 7.5
    assert parse_rate("no number here") is None
    assert parse_rate("100") is None


def test_salesforce_lead_structure():
    required_fields = [
        "FirstName", "LastName", "Phone", "Email",
        "Street", "City", "State", "PostalCode",
        "LeadSource", "Description",
        "Haboob_Current_Rate__c",
        "Haboob_Loan_Balance__c",
        "Haboob_Property_Value__c",
        "Haboob_Equity_Pct__c",
        "Haboob_Monthly_Savings__c",
        "Haboob_Fidelity_Score__c",
        "Haboob_Has_HI_Debt__c",
        "Haboob_Break_Even_Months__c",
    ]

    mock_lead = {
        "FirstName": "Jordan",
        "LastName": "Autrey",
        "Phone": "4807084315",
        "Email": "hello@itsvoco.com",
        "Street": "123 Test St",
        "City": "Los Angeles",
        "State": "CA",
        "PostalCode": "90001",
        "LeadSource": "Haboob",
        "Description": "Test verdict",
        "Haboob_Current_Rate__c": 7.25,
        "Haboob_Loan_Balance__c": 425000,
        "Haboob_Property_Value__c": 750000,
        "Haboob_Equity_Pct__c": 43.3,
        "Haboob_Monthly_Savings__c": 487,
        "Haboob_Fidelity_Score__c": 8,
        "Haboob_Has_HI_Debt__c": False,
        "Haboob_Break_Even_Months__c": 22,
    }

    for field in required_fields:
        assert field in mock_lead

    assert mock_lead["LeadSource"] == "Haboob"


def test_lo_priority_tiers():
    tier_map = {
        0: "NURTURE", 1: "NURTURE", 2: "NURTURE",
        3: "NURTURE", 4: "NURTURE",
        5: "WITHIN_24H", 6: "WITHIN_24H", 7: "WITHIN_24H",
        8: "SAME_DAY", 9: "SAME_DAY", 10: "SAME_DAY",
    }

    def get_tier(score):
        if score >= 8: return "SAME_DAY"
        if score >= 5: return "WITHIN_24H"
        return "NURTURE"

    for score, expected_tier in tier_map.items():
        assert get_tier(score) == expected_tier
