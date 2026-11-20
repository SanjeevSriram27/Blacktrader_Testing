import csv
import re

def clean_preconditions(raw, title):
    if not raw:
        return "Platform online; QA account authenticated"
    text = raw.strip()
    # Strip leading title if repeated
    if text.startswith(title):
        text = text[len(title):].strip()
    if text.lower().startswith("pre:"):
        text = text[4:].strip()
    # Replace excessive newlines
    text = re.sub(r'\s+', ' ', text)
    return text if text else "Platform online; QA account authenticated"

def clean_steps(raw):
    if not raw:
        return "1. Execute test action\n2. Verify response"
    text = raw.strip()
    if text.lower().startswith("steps:"):
        text = text[6:].strip()
    # Check if there is an embedded Expected: in steps
    if "Expected:" in text:
        text = text.split("Expected:")[0].strip()
    return text

def extract_test_data(row):
    steps = row.get('steps', '')
    pre = row.get('preconditions', '')
    title = row.get('title', '')
    combined = f"{title} {pre} {steps}"
    
    data_points = []
    # Match deposits or funds like $1,000, 1000, 100 USD
    m_dep = re.findall(r'\$[\d,]+(?:\.\d+)?', combined)
    if m_dep:
        data_points.append(f"Amount: {', '.join(set(m_dep[:2]))}")
    
    # Match percentages like 20%
    m_pct = re.findall(r'\d+(?:\.\d+)?%', combined)
    if m_pct:
        data_points.append(f"Share: {', '.join(set(m_pct[:2]))}")
        
    # Match symbol like EURUSD, BTCUSDT, XAUUSD
    m_sym = re.findall(r'[A-Z]{3,6}(?:USD|USDT|\.P)', combined)
    if m_sym:
        data_points.append(f"Symbol: {m_sym[0]}")
        
    # Match lot
    m_lot = re.findall(r'\d+(?:\.\d+)?\s*lot[s]?', combined, re.IGNORECASE)
    if m_lot:
        data_points.append(f"Volume: {m_lot[0]}")
        
    if not data_points:
        if "PAMM" in combined:
            return "Pool: Alpha Growth Pool / real (Hedging)"
        return "Standard QA test payload"
    return " | ".join(data_points)

with open('codex_all_case_results.csv', mode='r', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))

for i in [0, 1, 2, 5, 10, 50, 100, 200]:
    r = rows[i]
    print(f"ID: {r['id']}")
    print(f"TITLE: {r['title']}")
    print(f"PRE: {clean_preconditions(r['preconditions'], r['title'])}")
    print(f"STEPS: {clean_steps(r['steps'])[:80]}...")
    print(f"DATA: {extract_test_data(r)}")
    print("---")
