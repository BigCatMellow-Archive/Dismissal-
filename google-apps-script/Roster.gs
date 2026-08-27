function syncCarpoolRoster() {
  const ss = getSpreadsheet_();
  const carpool = ss.getSheetByName('Carpool');
  const table1 = ss.getSheetByName('Table1');
  if (!carpool) throw new Error('Carpool sheet not found.');
  if (!table1) throw new Error('Table1 sheet not found.');

  const students = ss.getSheetByName(DS.SHEETS.STUDENTS);
  const groups = ss.getSheetByName(DS.SHEETS.GROUPS);
  const members = ss.getSheetByName(DS.SHEETS.MEMBERS);

  [students, groups, members].forEach(sheet => {
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getMaxRows() - 1, sheet.getMaxColumns()).clearContent();
    }
  });

  students.getRange('A2').setFormula('=ARRAYFORMULA(FILTER({"S:"&Carpool!A2:A&"|"&Carpool!B2:B&"|"&Carpool!C2:C,Carpool!B2:B&" "&Carpool!A2:A,IF(REGEXMATCH(LOWER(Carpool!E2:E),"begin"),"Beg",IF(REGEXMATCH(LOWER(Carpool!E2:E),"pre"),"PreK",IF(REGEXMATCH(LOWER(Carpool!E2:E),"kind"),"K",IF(REGEXMATCH(LOWER(Carpool!E2:E),"first"),"1st",IF(REGEXMATCH(LOWER(Carpool!E2:E),"second"),"2nd",IF(REGEXMATCH(LOWER(Carpool!E2:E),"third"),"3rd",IF(REGEXMATCH(LOWER(Carpool!E2:E),"fourth"),"4th",IF(REGEXMATCH(LOWER(Carpool!E2:E),"fifth"),"5th",IF(REGEXMATCH(LOWER(Carpool!E2:E),"sixth"),"6th",IF(REGEXMATCH(LOWER(Carpool!E2:E),"seventh"),"7th",IF(REGEXMATCH(LOWER(Carpool!E2:E),"eighth"),"8th",Carpool!E2:E))))))))))),Carpool!C2:C,Carpool!D2:D<>""},Carpool!D2:D<>""))');

  groups.getRange('A2').setFormula('=ARRAYFORMULA(FILTER({"PG-"&Table1!A2:A,Table1!B2:B,Table1!A2:A&"",IF(Table1!A2:A<>"","family",""),Table1!A2:A<>""},Table1!A2:A<>""))');

  members.getRange('A2').setFormula('=ARRAYFORMULA(FILTER({"PG-"&Carpool!D2:D,"S:"&Carpool!A2:A&"|"&Carpool!B2:B&"|"&Carpool!C2:C,Carpool!D2:D<>""},Carpool!D2:D<>""))');

  SpreadsheetApp.flush();
  invalidateCaches_();

  return {
    ok: true,
    students: Math.max(0, students.getLastRow() - 1),
    pickupGroups: Math.max(0, groups.getLastRow() - 1),
    memberships: Math.max(0, members.getLastRow() - 1),
    barcodeNote: 'Barcode Token is the numeric Carpool ID from the source sheet.'
  };
}
