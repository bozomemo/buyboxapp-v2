using OfficeOpenXml;
using System;
using System.Collections.Generic;
using System.Data;
using System.Data.OleDb;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace BuyBoxApp
{
    internal class FileFunctions
    {
        public static bool openStockFile()
        {
            string fileName = openFile();
            if (fileName != string.Empty)
            {
                Applications.StockTable = ConvertExcelToDataTable(fileName);
                return true;
            }
            else
            {
                return false;
            }
        }
        public static bool openUnitFile()
        {
            string fileName = openFile();
            if (fileName != string.Empty)
            {
                Applications.TyTable = ConvertProductExcelToDataTable(fileName);
                return true;
            }
            else
            {
                return false;
            }
        }
        static string openFile()
        {
            using (OpenFileDialog openFileDialog = new OpenFileDialog())
            {
                openFileDialog.InitialDirectory = "c:\\";
                openFileDialog.Filter = "txt files (*.txt)|*.txt|All files (*.*)|*.*";
                openFileDialog.FilterIndex = 2;
                openFileDialog.RestoreDirectory = true;
                if (openFileDialog.ShowDialog() == DialogResult.OK)
                {
                    //Get the path of specified file
                    return openFileDialog.FileName;
                }
                else
                {
                    return string.Empty;
                }
            }
        }
        public static DataTable ConvertExcelToDataTable(string fileName)
        {
            DataTable dtResult = null;
            int totalSheet = 0; //No of sheets on excel file  
            using (OleDbConnection objConn = new OleDbConnection("Provider = Microsoft.ACE.OLEDB.12.0; Data Source = " + fileName + "; Extended Properties = 'Excel 12.0 Xml;HDR=YES';"))
            {
                objConn.Open();
                OleDbCommand cmd = new OleDbCommand();
                OleDbDataAdapter oleda = new OleDbDataAdapter();
                DataSet ds = new DataSet();
                DataTable dt = objConn.GetOleDbSchemaTable(OleDbSchemaGuid.Tables, null);
                string sheetName = string.Empty;
                if (dt != null)
                {
                    var tempDataTable = (from dataRow in dt.AsEnumerable()
                                         where !dataRow["TABLE_NAME"].ToString().Contains("FilterDatabase")
                                         select dataRow).CopyToDataTable();
                    dt = tempDataTable;
                    totalSheet = dt.Rows.Count;
                    sheetName = dt.Rows[0]["TABLE_NAME"].ToString();
                }
                cmd.Connection = objConn;
                cmd.CommandType = CommandType.Text;
                cmd.CommandText = "SELECT * FROM [" + sheetName + "]";
                oleda = new OleDbDataAdapter(cmd);
                oleda.Fill(ds, "excelData");
                dtResult = ds.Tables["excelData"];
                objConn.Close();
                return dtResult; //Returning Dattable  
            }
        }
        //public static DataTable ConvertProductExcelToDataTable(string fileName)
        //{
        //    using (OleDbConnection objConn = new OleDbConnection("Provider = Microsoft.ACE.OLEDB.12.0; Data Source = " + fileName + "; Extended Properties = 'Excel 12.0 Xml;HDR=YES';"))
        //    {
        //        objConn.Open();
        //        OleDbCommand cmd = new OleDbCommand();
        //        OleDbDataAdapter oleda = new OleDbDataAdapter();
        //        DataSet ds = new DataSet();
        //        string sheetName = "Ürünler$";
        //        cmd.Connection = objConn;
        //        cmd.CommandType = CommandType.Text;
        //        cmd.CommandText = "SELECT * FROM [" + sheetName + "]";
        //        oleda = new OleDbDataAdapter(cmd);
        //        oleda.Fill(ds, "excelData");
        //        DataTable dtResult = ds.Tables["excelData"];
        //        objConn.Close();
        //        return dtResult; //Returning Dattable  
        //    }
        //}

        public static DataTable ConvertProductExcelToDataTable(string fileName)
        {
            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;

            // Create a new DataTable to store the Excel data
            DataTable dtResult = new DataTable();

            // Load the Excel file
            FileInfo fileInfo = new FileInfo(fileName);

            using (ExcelPackage package = new ExcelPackage(fileInfo))
            {
                // Get the first worksheet
                ExcelWorksheet worksheet = package.Workbook.Worksheets["Ürünler"];
                if (worksheet == null)
                {
                    throw new Exception("Sheet 'Ürünler' not found in the Excel file.");
                }

                // Load columns (first row as header)
                for (int col = 1; col <= worksheet.Dimension.End.Column; col++)
                {
                    dtResult.Columns.Add(worksheet.Cells[1, col].Text);
                }

                // Load rows
                for (int row = 2; row <= worksheet.Dimension.End.Row; row++) // Start from row 2 to skip header
                {
                    DataRow newRow = dtResult.NewRow();
                    for (int col = 1; col <= worksheet.Dimension.End.Column; col++)
                    {
                        newRow[col - 1] = worksheet.Cells[row, col].Text;
                    }
                    dtResult.Rows.Add(newRow);
                }
            }

            return dtResult;
        }



        public static void WriteLog(string log)
        {
            string path = @"D:\Farmaucuz Files\Yazılım\Logs.txt";
            if (!File.Exists(path))
            {
                using (StreamWriter sw = File.CreateText(path))
                {
                    sw.WriteLine(log);
                }
            }
            else
            {
                using (StreamWriter sw = File.AppendText(path))
                {
                    sw.WriteLine(log);
                }
            }
        }
        public static void WritePossibleBuybox(string log)
        {
            string path = @"C:\Users\Mehmet\Desktop\Farmaucuz Files\Yazılım\PossibleBuybox.txt";
            if (!File.Exists(path))
            {
                using (StreamWriter sw = File.CreateText(path))
                {
                    sw.WriteLine(log);
                }
            }
            else
            {
                using (StreamWriter sw = File.AppendText(path))
                {
                    sw.WriteLine(log);
                }
            }
        }
    }
}
