import json
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, create_model, Field
from typing import Any, Dict, Optional, Type

# Initialize FastAPI app
app = FastAPI(
    title="SACE Agentic Auditor",
    description="Sovereign Agentic Compliance Engine - Pipeline for analyzing MedTech lab reports against industrial regulations.",
    version="1.0.0"
)

# --- Data Models ---

class AuditRequest(BaseModel):
    user_prompt: str
    compliance_rule_text: str
    image_path: str
    compliance_rule_bounds: Dict[str, Any]

class AuditResponse(BaseModel):
    status: str
    extracted_data: Optional[Dict[str, Any]]
    reason: str


# --- Phase 1: Rule Retrieval & Schema Generation ---

def generate_compliance_schema(user_prompt: str, compliance_rule_text: str) -> Type[BaseModel]:
    """
    Phase 1: Analyzes the user's intent and compliance rule using an LLM, 
    and dynamically compiles a Pydantic schema at runtime.
    """
    print(f"\n[Phase 1] LLM analyzing rule: '{compliance_rule_text}'")
    
    # In a production environment, you would invoke your LLM here:
    # prompt = f"Analyze rule: {compliance_rule_text}. Intent: {user_prompt}. Return JSON schema."
    # llm_json_response = llm.generate(prompt)
    
    # --- MOCK LLM RESPONSE ---
    # We mock the LLM outputting a dictionary of required fields and their Python types based on the prompt
    mock_llm_json_response = {
        "extracted_value": float,
        "unit": str
    }
    
    # Dynamically build the fields for Pydantic
    fields = {}
    for field_name, python_type in mock_llm_json_response.items():
        fields[field_name] = (python_type, Field(..., description=f"The {field_name} extracted from the lab report"))
        
    # Dynamically compile the dictionary into a Pydantic BaseModel class
    DynamicSchema = create_model('DynamicComplianceSchema', **fields)
    print(f"[Phase 1] Dynamically generated schema '{DynamicSchema.__name__}' with fields: {list(DynamicSchema.model_fields.keys())}")
    
    return DynamicSchema


# --- Phase 2: Vision Extractor ---

def extract_data_from_image(image_path: str, dynamic_schema: Type[BaseModel]) -> Optional[BaseModel]:
    """
    Phase 2: Passes the image to a Vision-Language Model (VLM), strictly enforcing 
    structured output using the dynamically generated Pydantic schema.
    """
    print(f"[Phase 2] VLM processing image: {image_path} using {dynamic_schema.__name__}...")
    
    # In production, send `image_path` and `dynamic_schema.schema_json()` to your VLM.
    # The VLM must output a JSON object matching the schema exactly.
    
    # --- MOCK VLM EXTRACTION ---
    # Simulate different extraction scenarios based on the mock image filename
    if "non_compliant_report.png" in image_path:
        mock_vlm_output = {"extracted_value": 18.2, "unit": "mA"}
    elif "compliant_report.png" in image_path:
        mock_vlm_output = {"extracted_value": 12.5, "unit": "mA"}
    else:
        # Phase 3 condition: VLM cannot find the data (e.g., image is blurry, wrong page, data missing)
        print("[Phase 2] VLM Error: Could not confidently extract data matching the schema.")
        return None
        
    try:
        # Strictly enforce the output using the dynamic schema
        validated_data = dynamic_schema(**mock_vlm_output)
        print(f"[Phase 2] VLM successfully extracted and validated: {validated_data.model_dump()}")
        return validated_data
    except Exception as e:
        print(f"[Phase 2] VLM output failed schema validation: {e}")
        return None


# --- Phase 3 & 4: The Confidence Gate & Deterministic Logic Gate ---

def evaluate_compliance(extracted_data: Optional[BaseModel], compliance_rule_bounds: dict) -> dict:
    """
    Phase 3 & Phase 4: Validates extraction success and performs pure Python deterministic logic 
    to calculate Pass/Fail status without relying on an LLM.
    """
    # Phase 3: The Confidence Gate
    # If VLM extraction failed (returned None), immediately flag as INCOMPLETE_EVIDENCE
    if extracted_data is None:
        return {
            "status": "INCOMPLETE_EVIDENCE",
            "extracted_data": None,
            "reason": "VLM could not find the data required by the schema in the provided image."
        }
        
    data_dict = extracted_data.model_dump()
    
    # Phase 4: The Deterministic Logic Gate
    # Pure Python logic based on the passed bounds
    target_field = compliance_rule_bounds.get("target_field", "extracted_value")
    max_val = compliance_rule_bounds.get("max_val")
    min_val = compliance_rule_bounds.get("min_val")
    
    if target_field not in data_dict:
        return {
            "status": "INCOMPLETE_EVIDENCE",
            "extracted_data": data_dict,
            "reason": f"Required compliance field '{target_field}' is missing from extracted data."
        }
        
    actual_value = data_dict[target_field]
    
    # Deterministic checks
    if max_val is not None and actual_value > max_val:
        return {
            "status": "FAIL",
            "extracted_data": data_dict,
            "reason": f"Extracted value ({actual_value}) exceeds maximum allowed limit of {max_val}."
        }
        
    if min_val is not None and actual_value < min_val:
        return {
            "status": "FAIL",
            "extracted_data": data_dict,
            "reason": f"Extracted value ({actual_value}) is below minimum allowed limit of {min_val}."
        }
        
    return {
        "status": "PASS",
        "extracted_data": data_dict,
        "reason": f"Extracted value ({actual_value}) is within acceptable compliance bounds (Max: {max_val})."
    }


# --- FastAPI Pipeline Endpoint ---

@app.post("/api/audit", response_model=AuditResponse)
async def run_agentic_auditor_pipeline(request: AuditRequest):
    """
    End-to-End Pipeline execution endpoint.
    """
    try:
        # Phase 1
        dynamic_schema = generate_compliance_schema(
            user_prompt=request.user_prompt, 
            compliance_rule_text=request.compliance_rule_text
        )
        
        # Phase 2
        extracted_data = extract_data_from_image(
            image_path=request.image_path, 
            dynamic_schema=dynamic_schema
        )
        
        # Phases 3 & 4
        evaluation_result = evaluate_compliance(
            extracted_data=extracted_data, 
            compliance_rule_bounds=request.compliance_rule_bounds
        )
        
        return AuditResponse(**evaluation_result)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# MOCK TEST BLOCK
# ==========================================
if __name__ == "__main__":
    print("\n" + "="*60)
    print("SACE Agentic Auditor Pipeline - Mock Simulation")
    print("="*60)
    
    # Context
    user_prompt = "Extract the standby battery discharge rate and verify it against the MDR rule."
    mdr_rule_text = "MDR Annex II Section 4: Battery discharge rate must not exceed 15.0 mA during standby operations."
    rule_bounds = {"target_field": "extracted_value", "max_val": 15.0}
    
    print("\n--- TEST CASE 1: Compliant Lab Report ---")
    schema = generate_compliance_schema(user_prompt, mdr_rule_text)
    data_pass = extract_data_from_image("data/scans/compliant_report.png", schema)
    result_pass = evaluate_compliance(data_pass, rule_bounds)
    print("\n[Final Output]")
    print(json.dumps(result_pass, indent=2))
    
    print("\n" + "-"*60)
    print("--- TEST CASE 2: Non-Compliant Lab Report ---")
    data_fail = extract_data_from_image("data/scans/non_compliant_report.png", schema)
    result_fail = evaluate_compliance(data_fail, rule_bounds)
    print("\n[Final Output]")
    print(json.dumps(result_fail, indent=2))
    
    print("\n" + "-"*60)
    print("--- TEST CASE 3: Incomplete Evidence (Blurry or Missing Data) ---")
    data_inc = extract_data_from_image("data/scans/blurry_scan.png", schema)
    result_inc = evaluate_compliance(data_inc, rule_bounds)
    print("\n[Final Output]")
    print(json.dumps(result_inc, indent=2))
    print("\n" + "="*60 + "\n")
