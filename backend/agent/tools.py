"""
tools.py

LangChain tools for the Patient Risk Understanding Agent.
Uses @tool decorator from langchain_core.tools.

All tools read from the existing database / context_builder.
NONE of them recalculate risk or SHAP values.
"""

import json
import logging
from langchain_core.tools import tool
from .context_builder import build_patient_context, get_intervention_for_driver

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# Tool 1 — get_patient_context
# ─────────────────────────────────────────────
@tool
def get_patient_context(patient_id: str) -> str:
    """
    Retrieve the full structured patient context from the database.
    Returns patient demographics, risk predictions, SDOH data,
    clinical utilization, and TreeSHAP-attributed risk drivers.
    Use this tool whenever you need to understand or explain a patient's risk.
    """
    try:
        ctx = build_patient_context(patient_id)
        if 'error' in ctx:
            return f"Error: {ctx['error']}"
        return ctx['context_text']
    except Exception as e:
        logger.error(f"get_patient_context error for {patient_id}: {e}")
        return f"Error retrieving patient context: {str(e)}"


# ─────────────────────────────────────────────
# Tool 2 — get_shap_drivers
# ─────────────────────────────────────────────
@tool
def get_shap_drivers(patient_id: str) -> str:
    """
    Return the actual stored TreeSHAP feature attributions for a patient.
    These values were pre-calculated by the ML system and stored in the database.
    Do NOT recalculate them. Returns JSON with feature name, display name,
    value, SHAP contribution, and category (SDOH or Clinical).
    """
    try:
        ctx = build_patient_context(patient_id)
        if 'error' in ctx:
            return f"Error: {ctx['error']}"

        drivers = ctx.get('shap_drivers', [])
        if not drivers:
            return "No TreeSHAP drivers available for this patient."

        result = []
        for d in drivers:
            result.append({
                'rank': d.get('rank'),
                'feature': d.get('feature'),
                'display_name': d.get('display_name'),
                'value': d.get('raw_value'),
                'shap': round(float(d.get('shap_value', 0)), 4),
                'shap_formatted': d.get('shap_formatted'),
                'category': d.get('category'),
            })
        return json.dumps(result, indent=2)
    except Exception as e:
        logger.error(f"get_shap_drivers error for {patient_id}: {e}")
        return f"Error retrieving SHAP drivers: {str(e)}"


# ─────────────────────────────────────────────
# Tool 3 — get_intervention_options
# ─────────────────────────────────────────────
@tool
def get_intervention_options(patient_id: str) -> str:
    """
    Map the patient's identified risk drivers to potential care-management
    intervention categories. The mapping is deterministic, based on the
    actual SHAP drivers from the ML system. These are care-management
    considerations only, NOT medical prescriptions or program eligibility decisions.
    """
    try:
        ctx = build_patient_context(patient_id)
        if 'error' in ctx:
            return f"Error: {ctx['error']}"

        options = ctx.get('intervention_options', [])
        if not options:
            return "No intervention options available — SHAP drivers not found."

        lines = [
            f"Potential care-management interventions for patient {patient_id}:",
            "(Based on top SHAP drivers — all are suggestions for qualified professionals to review)",
            "",
        ]
        seen = set()
        for opt in options:
            iv = opt['intervention']
            if iv not in seen:
                lines.append(
                    f"• {opt['driver']} ({opt['shap_formatted']}, {opt['category']}) → {iv}"
                )
                seen.add(iv)

        return '\n'.join(lines)
    except Exception as e:
        logger.error(f"get_intervention_options error for {patient_id}: {e}")
        return f"Error retrieving intervention options: {str(e)}"


# ─────────────────────────────────────────────
# Tool 4 — get_patient_history
# ─────────────────────────────────────────────
@tool
def get_patient_history(patient_id: str) -> str:
    """
    Retrieve any available previous interventions, outreach status,
    or relevant historical information for the patient.
    If no history is stored, returns a clear note rather than inventing data.
    """
    try:
        return (
            f"No outreach or intervention history is currently stored for patient {patient_id}. "
            "The system tracks future risk predictions and SHAP-based drivers, "
            "but a formal outreach tracking module has not yet been implemented. "
            "Care managers should consult existing care management records externally."
        )
    except Exception as e:
        logger.error(f"get_patient_history error for {patient_id}: {e}")
        return f"Error retrieving patient history: {str(e)}"



# ─────────────────────────────────────────────
# Tool 5 — compare_tract_factors
# ─────────────────────────────────────────────
@tool
def compare_tract_factors(patient_id: str) -> str:
    """
    Compare the patient's census tract SDOH factors against California-wide averages
    from the same CommunitySDOH database. Shows whether each factor is better, worse,
    or similar compared to the state average across all tracts.
    Use this when the user asks how this patient's area compares to others,
    or wants context on how severe the social factors are relative to the state.
    """
    try:
        from sdoh.models import CommunitySDOH
        from django.db.models import Avg
        import statistics

        ctx = build_patient_context(patient_id)
        if 'error' in ctx:
            return f"Error: {ctx['error']}"

        tract_fips = ctx['tract_fips']
        sdoh_data  = ctx['sdoh_data']
        county     = ctx['county']

        # California-wide averages from ALL tracts in our dataset
        ca_avgs = CommunitySDOH.objects.aggregate(
            avg_poverty          = Avg('poverty_2022'),
            avg_income           = Avg('income_2022'),
            avg_unemployment     = Avg('unemployment_2022'),
            avg_housing_burden   = Avg('housing_burden_2022'),
            avg_uninsured        = Avg('uninsured_2022'),
            avg_food_access      = Avg('food_access_population_2022'),
            avg_no_vehicle       = Avg('no_vehicle_2022'),
            avg_disability       = Avg('disability_2022'),
            avg_broadband        = Avg('broadband_2022'),
            avg_education        = Avg('education_2022'),
        )

        def fmt_diff(patient_val, ca_avg, higher_is_worse=True):
            """Return a severity label and direction string."""
            if patient_val is None or ca_avg is None:
                return 'No comparison data available'
            diff = patient_val - ca_avg
            pct  = (diff / ca_avg * 100) if ca_avg else 0
            if higher_is_worse:
                if diff > ca_avg * 0.3:
                    severity = '🔴 Critically higher'
                elif diff > ca_avg * 0.1:
                    severity = '🟠 Notably higher'
                elif diff > 0:
                    severity = '🟡 Slightly above'
                elif diff > -ca_avg * 0.1:
                    severity = '🟢 Similar'
                else:
                    severity = '✅ Better than average'
            else:
                # For income/education: higher is BETTER
                if diff < -ca_avg * 0.3:
                    severity = '🔴 Critically below'
                elif diff < -ca_avg * 0.1:
                    severity = '🟠 Notably below'
                elif diff < 0:
                    severity = '🟡 Slightly below'
                elif diff < ca_avg * 0.1:
                    severity = '🟢 Similar'
                else:
                    severity = '✅ Above average'
            direction = f"+{abs(pct):.0f}% above CA avg" if diff > 0 else f"{abs(pct):.0f}% below CA avg"
            return f"{severity} ({direction})"

        comparisons = [
            {
                'factor': 'Poverty Rate',
                'patient_value': f"{sdoh_data.get('poverty_rate', 'N/A')}%",
                'ca_average': f"{ca_avgs['avg_poverty']:.1f}%" if ca_avgs['avg_poverty'] else 'N/A',
                'comparison': fmt_diff(sdoh_data.get('poverty_rate'), ca_avgs['avg_poverty'], higher_is_worse=True),
                'meaning': 'Higher poverty rates are strongly associated with reduced access to healthcare and social resources.'
            },
            {
                'factor': 'Area Median Income',
                'patient_value': f"${sdoh_data.get('area_median_income', 0):,.0f}",
                'ca_average': f"${ca_avgs['avg_income']:,.0f}" if ca_avgs['avg_income'] else 'N/A',
                'comparison': fmt_diff(sdoh_data.get('area_median_income'), ca_avgs['avg_income'], higher_is_worse=False),
                'meaning': 'Lower income relative to state average limits members\' ability to access care and manage health costs.'
            },
            {
                'factor': 'Transportation Barrier (No Vehicle)',
                'patient_value': f"{sdoh_data.get('transportation_barrier', 'N/A')}%",
                'ca_average': f"{ca_avgs['avg_no_vehicle']:.1f}%" if ca_avgs['avg_no_vehicle'] else 'N/A',
                'comparison': fmt_diff(sdoh_data.get('transportation_barrier'), ca_avgs['avg_no_vehicle'], higher_is_worse=True),
                'meaning': 'A higher share of households without vehicles increases barriers to attending healthcare appointments.'
            },
            {
                'factor': 'Broadband Access Limitation',
                'patient_value': f"{sdoh_data.get('broadband_limitation', 'N/A')}%",
                'ca_average': f"{ca_avgs['avg_broadband']:.1f}%" if ca_avgs['avg_broadband'] else 'N/A',
                'comparison': fmt_diff(sdoh_data.get('broadband_limitation'), ca_avgs['avg_broadband'], higher_is_worse=True),
                'meaning': 'Limited broadband access reduces the ability to use telehealth services and access digital health resources.'
            },
            {
                'factor': 'Food Access Limitation',
                'patient_value': f"{sdoh_data.get('food_access_limitation', 'N/A')}%",
                'ca_average': f"{ca_avgs['avg_food_access']:.1f}%" if ca_avgs['avg_food_access'] else 'N/A',
                'comparison': fmt_diff(sdoh_data.get('food_access_limitation'), ca_avgs['avg_food_access'], higher_is_worse=True),
                'meaning': 'Food insecurity is directly linked to chronic disease risk and poor health outcomes.'
            },
            {
                'factor': 'Housing Cost Burden',
                'patient_value': f"{sdoh_data.get('housing_burden', 'N/A')}%",
                'ca_average': f"{ca_avgs['avg_housing_burden']:.1f}%" if ca_avgs['avg_housing_burden'] else 'N/A',
                'comparison': fmt_diff(sdoh_data.get('housing_burden'), ca_avgs['avg_housing_burden'], higher_is_worse=True),
                'meaning': 'High housing cost burden leaves less income available for healthcare, medications, and nutrition.'
            },
            {
                'factor': 'Unemployment Rate',
                'patient_value': f"{sdoh_data.get('unemployment_rate', 'N/A')}%",
                'ca_average': f"{ca_avgs['avg_unemployment']:.1f}%" if ca_avgs['avg_unemployment'] else 'N/A',
                'comparison': fmt_diff(sdoh_data.get('unemployment_rate'), ca_avgs['avg_unemployment'], higher_is_worse=True),
                'meaning': 'Higher unemployment correlates with loss of employer-sponsored insurance and reduced healthcare access.'
            },
        ]

        lines = [
            f"CENSUS TRACT COMPARISON — {county} (Tract {tract_fips})",
            f"Benchmarked against California-wide averages across all {CommunitySDOH.objects.count()} census tracts in our dataset.",
            "",
        ]
        for c in comparisons:
            lines.append(f"── {c['factor']} ──")
            lines.append(f"  This tract : {c['patient_value']}")
            lines.append(f"  CA average : {c['ca_average']}")
            lines.append(f"  Status     : {c['comparison']}")
            lines.append(f"  Context    : {c['meaning']}")
            lines.append("")

        return '\n'.join(lines)

    except Exception as e:
        logger.error(f"compare_tract_factors error for {patient_id}: {e}", exc_info=True)
        return f"Error generating comparison: {str(e)}"


# Export all tools as a list
ALL_TOOLS = [
    get_patient_context,
    get_shap_drivers,
    get_intervention_options,
    get_patient_history,
    compare_tract_factors,
]
