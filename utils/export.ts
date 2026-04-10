import ExcelJS from "exceljs";

type ExportRow = {
  id: string;
  type: string;
  title: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  testData?: string;
};

export const downloadCSV = (rows: ExportRow[]) => {
  let csvContent =
    "Test Case ID,Type,Title,Preconditions,Steps,Expected Result,Test Data\n";

  rows.forEach((row) => {
    const columns = [
      row.id,
      row.type,
      row.title,
      row.preconditions,
      row.steps,
      row.expectedResult,
      row.testData ?? "",
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`);

    csvContent += columns.join(",") + "\n";
  });

  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "test_cases.csv";
  link.click();
};

export const downloadExcel = async (rows: ExportRow[]) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Test Cases");

  worksheet.columns = [
    { header: "Test Case ID", key: "id", width: 18 },
    { header: "Type", key: "type", width: 18 },
    { header: "Title", key: "title", width: 30 },
    { header: "Preconditions", key: "preconditions", width: 35 },
    { header: "Steps", key: "steps", width: 45 },
    { header: "Expected Result", key: "expectedResult", width: 35 },
    { header: "Test Data", key: "testData", width: 45 },
  ];

  rows.forEach((row) => worksheet.addRow(row));

  const buffer = await workbook.xlsx.writeBuffer();

  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "test_cases.xlsx";
  link.click();
};
