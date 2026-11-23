import fs from 'node:fs/promises';
import path from 'node:path';
import { FileBlob, SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const cases = JSON.parse(await fs.readFile(path.join(root, 'all-case-results.json'), 'utf8'));
const summaryJson = JSON.parse(await fs.readFile(path.join(root, 'summary.json'), 'utf8'));
const outputPath = path.join(root, 'PAMM_Test_Assessment_349_Cases.xlsx');
const font = 'Arial';

const workbook = Workbook.create();
const summary = workbook.worksheets.add('Summary');
const results = workbook.worksheets.add('All Results');
summary.showGridLines = false;
results.showGridLines = false;
summary.tabColor = '#1F4E78';
results.tabColor = '#5B9BD5';

summary.getRange('A2:G2').merge();
summary.getRange('A2').values = [['PAMM functional assessment']];
summary.getRange('A2:G2').format = { font: { name: font, size: 16, bold: true, color: '#172033' }, verticalAlignment: 'center' };
summary.getRange('A3:G3').merge();
summary.getRange('A3').values = [['349 functional scenarios · simulated QA balances · updated 23 November 2026']];
summary.getRange('A3:G3').format = { font: { name: font, size: 10, italic: true, color: '#5B6573' } };
summary.getRange('A4:G4').format.borders = { bottom: { style: 'thin', color: '#9EADBE' } };

summary.getRange('A6:B11').values = [
  ['Status', 'Count'],
  ['PASS', null],
  ['FAIL', null],
  ['PARTIAL', null],
  ['BLOCKED', null],
  ['INCONCLUSIVE', null],
];
for (let row = 7; row <= 11; row++) summary.getRange(`B${row}`).formulas = [[`=COUNTIFS('All Results'!$B$2:$B$350,A${row})`]];
summary.getRange('A6:B6').format = { fill: '#1F4E78', font: { name: font, size: 10, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', verticalAlignment: 'center' };
summary.getRange('A7:B11').format = { font: { name: font, size: 10 }, verticalAlignment: 'center', borders: { insideHorizontal: { style: 'thin', color: '#D8E0EA' }, bottom: { style: 'thin', color: '#9EADBE' } } };
summary.getRange('B7:B11').format.numberFormat = '0';
summary.getRange('B7:B11').format.horizontalAlignment = 'right';

summary.getRange('D6:G6').merge();
summary.getRange('D6').values = [['Retest summary']];
summary.getRange('D6:G6').format = { fill: '#D9E8F5', font: { name: font, size: 10, bold: true, color: '#172033' }, verticalAlignment: 'center' };
summary.getRange('D7:G11').values = [[
  'Previously blocked rows', summaryJson.blocked_retest_attempts ?? 91, 'Current blocked rows', summaryJson.case_matrix_status_counts.BLOCKED,
], [
  'Prop API result', '404', 'PAMM rows mapped to prop', 0,
], [
  'Confirmed new defects', summaryJson.new_findings, 'Status changes', summaryJson.phase3_status_changes,
], [
  'Assessment complete', summaryJson.complete_assessment ? 'Yes' : 'No', 'Internal browser', summaryJson.internal_browser_available ? 'Available' : 'Unavailable',
], [
  'Retest evidence', 'evidence/blocked-retest-sweep.json', 'Detailed results', 'All Results tab',
]];
summary.getRange('D7:G11').format = { font: { name: font, size: 10 }, wrapText: true, verticalAlignment: 'center', borders: { insideHorizontal: { style: 'thin', color: '#D8E0EA' }, bottom: { style: 'thin', color: '#9EADBE' } } };
summary.getRange('D7:D11').format.font = { name: font, size: 10, bold: true, color: '#344054' };
summary.getRange('F7:F11').format.font = { name: font, size: 10, bold: true, color: '#344054' };

summary.getRange('A14:G14').merge();
summary.getRange('A14').values = [['Interpretation']];
summary.getRange('A14:G14').format = { fill: '#D9E8F5', font: { name: font, size: 10, bold: true, color: '#172033' } };
summary.getRange('A15:G17').merge();
summary.getRange('A15').values = [[
  'All 91 formerly blocked PAMM rows received one live capability or precondition retest. They are PARTIAL when the full reference behavior remains unverified. The prop API family covers challenges, prop accounts and prop payouts; those routes returned 404, and no PAMM matrix row maps to those workflows. PASS is reserved for completed scoped assertions.',
]];
summary.getRange('A15:G17').format = { font: { name: font, size: 10, color: '#344054' }, wrapText: true, verticalAlignment: 'top' };

const headers = ['Case ID', 'Status', 'Title', 'Actual result', 'Why incomplete', 'Required to complete', 'Execution type', 'Evidence', 'Retest review', 'Priority', 'Area'];
const rows = cases.map((row) => [
  row.id, row.status, row.title, row.actual_result, row.not_completed_reason || '', row.required_to_complete || '', row.execution_type,
  row.evidence || '', row.retest_review || '', row.priority || '', row.area || '',
]);
results.getRange('A1:K1').values = [headers];
results.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows;
results.getRange(`A1:K${rows.length + 1}`).format.font = { name: font, size: 9 };
results.getRange('A1:K1').format = { fill: '#1F4E78', font: { name: font, size: 9, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true, borders: { insideVertical: { style: 'thin', color: '#FFFFFF' } } };
results.getRange(`A2:K${rows.length + 1}`).format.verticalAlignment = 'top';
results.getRange(`C2:I${rows.length + 1}`).format.wrapText = true;
results.getRange(`A2:B${rows.length + 1}`).format.verticalAlignment = 'center';
results.getRange(`J2:K${rows.length + 1}`).format.verticalAlignment = 'center';
results.getRange(`A1:K${rows.length + 1}`).format.borders = { insideHorizontal: { style: 'thin', color: '#E4E9F0' } };
results.tables.add(`A1:K${rows.length + 1}`, true, 'PammResultsTable').style = 'TableStyleMedium2';
results.freezePanes.freezeRows(1);
results.freezePanes.freezeColumns(2);
results.getRange(`B2:B${rows.length + 1}`).conditionalFormats.add('containsText', { text: 'PASS', format: { fill: '#E2F0D9', font: { bold: true, color: '#207245' } } });
results.getRange(`B2:B${rows.length + 1}`).conditionalFormats.add('containsText', { text: 'FAIL', format: { fill: '#FCE8E6', font: { bold: true, color: '#B42318' } } });
results.getRange(`B2:B${rows.length + 1}`).conditionalFormats.add('containsText', { text: 'PARTIAL', format: { fill: '#FFF2CC', font: { bold: true, color: '#8A5A00' } } });
results.getRange(`B2:B${rows.length + 1}`).conditionalFormats.add('containsText', { text: 'INCONCLUSIVE', format: { fill: '#EDE9FE', font: { bold: true, color: '#5B3FA3' } } });

summary.getRange('A1:G18').format.font = { name: font };
summary.getRange('A:A').format.columnWidth = 22;
summary.getRange('B:B').format.columnWidth = 12;
summary.getRange('C:C').format.columnWidth = 3;
summary.getRange('D:D').format.columnWidth = 22;
summary.getRange('E:E').format.columnWidth = 24;
summary.getRange('F:F').format.columnWidth = 22;
summary.getRange('G:G').format.columnWidth = 24;
summary.getRange('2:2').format.rowHeight = 26;
summary.getRange('15:17').format.rowHeight = 25;
results.getRange('A:A').format.columnWidth = 19;
results.getRange('B:B').format.columnWidth = 14;
results.getRange('C:C').format.columnWidth = 38;
results.getRange('D:D').format.columnWidth = 62;
results.getRange('E:F').format.columnWidth = 46;
results.getRange('G:G').format.columnWidth = 22;
results.getRange('H:H').format.columnWidth = 42;
results.getRange('I:I').format.columnWidth = 44;
results.getRange('J:J').format.columnWidth = 10;
results.getRange('K:K').format.columnWidth = 27;
results.getRange('1:1').format.rowHeight = 32;

workbook.recalculate();
const summaryCheck = await workbook.inspect({ kind: 'table', range: 'Summary!A2:G17', include: 'values,formulas', tableMaxRows: 20, tableMaxCols: 8, maxChars: 8000 });
console.log(summaryCheck.ndjson);
const errorCheck = await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!', options: { useRegex: true, maxResults: 50 }, summary: 'final formula error scan' });
console.log(errorCheck.ndjson);
const summaryPreview = await workbook.render({ sheetName: 'Summary', range: 'A1:G18', scale: 1.5, format: 'png' });
await fs.writeFile(path.join(root, 'evidence/report-sheet-summary-preview.png'), new Uint8Array(await summaryPreview.arrayBuffer()));
const resultsPreview = await workbook.render({ sheetName: 'All Results', range: 'A1:K18', scale: 1, format: 'png' });
await fs.writeFile(path.join(root, 'evidence/report-sheet-results-preview.png'), new Uint8Array(await resultsPreview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
const reopened = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
const reopenedCheck = await reopened.inspect({ kind: 'table', range: 'Summary!A6:G11', include: 'values,formulas', tableMaxRows: 10, tableMaxCols: 8, maxChars: 5000 });
console.log(reopenedCheck.ndjson);
console.log(JSON.stringify({ outputPath, rows: rows.length, counts: summaryJson.case_matrix_status_counts }, null, 2));
