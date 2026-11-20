import csv
import json
import os
import re

# Load codex all-case-results.csv
with open('codex_all_case_results.csv', mode='r', encoding='utf-8') as f:
    codex_rows = list(csv.DictReader(f))

# Load race results
with open('race_net_suite_results.json') as f:
    race_net = json.load(f)
with open('race_br_suite_results.json') as f:
    race_br = json.load(f)
with open('race_cp_suite_results.json') as f:
    race_cp = json.load(f)
with open('race_sltp_results.json') as f:
    race_sltp = json.load(f)
with open('race_net01_03_09_br08_results.json') as f:
    race_net01_03_09_br08 = json.load(f)

print(f"Loaded {len(codex_rows)} Codex rows")
