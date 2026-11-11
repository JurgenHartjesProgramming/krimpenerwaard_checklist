import ExcelJS from "exceljs";
async function main() {
  for (const f of process.argv.slice(2)) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f);
    console.log("\n#####", f.split("/").pop());
    for (const ws of wb.worksheets) {
      console.log(`\n== sheet "${ws.name}" rows=${ws.rowCount} cols=${ws.columnCount} merges=${(ws as any)._merges ? Object.keys((ws as any)._merges).length : 0}`);
      for (let r = 1; r <= Math.min(ws.rowCount, 14); r++) {
        const vals = (ws.getRow(r).values as any[]).slice(1).map((v) => (v && typeof v === "object" ? (v.richText ? v.richText.map((t: any) => t.text).join("") : v.text ?? v.result ?? JSON.stringify(v)) : v));
        console.log(r, JSON.stringify(vals).slice(0, 400));
      }
    }
  }
}
main();
