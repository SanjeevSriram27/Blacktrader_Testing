import shutil
import csv
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# Replace CSV
shutil.copyfile('BlackTrader_PAMM_QA_Sheet_With_Summary.csv', 'BlackTrader_PAMM_QA_Execution_Report.csv')
print("Updated local BlackTrader_PAMM_QA_Execution_Report.csv")

# Update XLSX Execution Table
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "PAMM Test Execution Report"
ws.views.sheetView[0].showGridLines = True

NAVY_HEADER = "1B365D"
WHITE = "FFFFFF"
LIGHT_GRAY_FILL = "F8F9FA"
BORDER_GRAY = "D1D5DB"
PASS_GREEN_BG = "E8F5E9"
PASS_GREEN_TXT = "2E7D32"
BLOCKED_AMBER_BG = "FFF8E1"
BLOCKED_AMBER_TXT = "F57F17"
FAIL_RED_BG = "FFEBEE"
FAIL_RED_TXT = "C62828"
PARTIAL_BLUE_BG = "E3F2FD"
PARTIAL_BLUE_TXT = "1565C0"

thin_side = Side(border_style="thin", color=BORDER_GRAY)
cell_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
header_font = Font(name="Arial", size=10, bold=True, color=WHITE)
header_fill = PatternFill(start_color=NAVY_HEADER, end_color=NAVY_HEADER, fill_type="solid")

with open('BlackTrader_PAMM_QA_Sheet_With_Summary.csv', mode='r', encoding='utf-8') as f:
    rows = list(csv.reader(f))

for r_idx, row in enumerate(rows, start=1):
    ws.row_dimensions[r_idx].height = 20
    for c_idx, val in enumerate(row, start=1):
        cell = ws.cell(row=r_idx, column=c_idx, value=val)
        cell.font = Font(name="Arial", size=9)
        
        # Row 1 Banner
        if r_idx == 1:
            cell.font = Font(name="Arial", size=12, bold=True, color=WHITE)
            cell.fill = header_fill
            if c_idx == 11:
                cell.alignment = Alignment(horizontal="right", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")
        # Row 4 Overall Status
        elif r_idx == 4:
            if c_idx == 1:
                cell.font = Font(name="Arial", size=9, bold=True)
            elif c_idx == 2:
                cell.font = Font(name="Arial", size=9, bold=True, color="1B5E20")
                cell.fill = PatternFill(start_color="E8F5E9", fill_type="solid")
        # Row 6 Metric Table Header
        elif r_idx == 6 and c_idx <= 8:
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = cell_border
        # Rows 7-8 Metric Table Data
        elif r_idx in [7, 8] and c_idx <= 8:
            cell.border = cell_border
            if c_idx == 1:
                cell.font = Font(name="Arial", size=9, bold=True)
            else:
                cell.alignment = Alignment(horizontal="center", vertical="center")
        # Row 10 Table Header
        elif r_idx == 10:
            ws.row_dimensions[r_idx].height = 28
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = cell_border
        # Rows 11 to 385 (Test Cases)
        elif 11 <= r_idx <= 385:
            cell.alignment = Alignment(vertical="center", wrap_text=True)
            cell.border = cell_border
            if c_idx in [1, 8, 9, 10]:
                cell.alignment = Alignment(horizontal="center", vertical="center")
            if c_idx == 8:
                cell.font = Font(name="Arial", size=9, bold=True)
                if val == 'PASS':
                    cell.fill = PatternFill(start_color=PASS_GREEN_BG, fill_type="solid")
                    cell.font = Font(name="Arial", size=9, bold=True, color=PASS_GREEN_TXT)
                elif val == 'BLOCKED':
                    cell.fill = PatternFill(start_color=BLOCKED_AMBER_BG, fill_type="solid")
                    cell.font = Font(name="Arial", size=9, bold=True, color=BLOCKED_AMBER_TXT)
                elif val == 'PARTIAL':
                    cell.fill = PatternFill(start_color=PARTIAL_BLUE_BG, fill_type="solid")
                    cell.font = Font(name="Arial", size=9, bold=True, color=PARTIAL_BLUE_TXT)
                elif val == 'FAIL':
                    cell.fill = PatternFill(start_color=FAIL_RED_BG, fill_type="solid")
                    cell.font = Font(name="Arial", size=9, bold=True, color=FAIL_RED_TXT)
        # Footer Tables
        elif r_idx >= 386:
            is_header = (row[0] in ["Status Legend", "Severity", "Execution Summary", "Role"])
            if is_header and c_idx <= 4:
                cell.font = header_font
                cell.fill = header_fill
                cell.border = cell_border
            elif row[0] and c_idx == 1:
                cell.font = Font(name="Arial", size=9, bold=True)
                cell.border = cell_border
            elif val:
                cell.border = cell_border

# Merges
ws.merge_cells("A1:J1")
ws.merge_cells("B4:K4")

# Freeze row 10
ws.freeze_panes = "A11"

# Column widths
col_widths = {
    'A': 16, 'B': 30, 'C': 26, 'D': 30, 'E': 22,
    'F': 30, 'G': 32, 'H': 12, 'I': 10, 'J': 12, 'K': 32
}
for col_let, width in col_widths.items():
    ws.column_dimensions[col_let].width = width

wb.save('BlackTrader_PAMM_QA_Execution_Report.xlsx')
print("Saved BlackTrader_PAMM_QA_Execution_Report.xlsx with new summary header")
