using System;
using System.Collections.Generic;
using System.Data;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BuyBoxApp
{
    internal static class Functions
    {
        private static double cargoPrice1 = 11.0;
        private static double cargoThreshold1 = 75;
        private static double cargoPrice2 = 9;
        private static double cargoThreshold2 = 30;
        private static double cargoPrice3 = 4.76;
        private static double cargoThreshold3 = 20;
        private static double cargoPrice4 = 4.76;

        public static int parseStockCode(string stockCode)
        {
            if (stockCode.Contains("-"))
            {
                string[] strArr = stockCode.Split('-');
                if (strArr[1].Contains("\""))
                {
                    strArr[1] = strArr[1].Replace("\"", "");
                }
                if (strArr[1].Contains("."))
                {
                    string[] strArr1 = strArr[1].Split('.');
                    strArr[1] = strArr1[0];
                }
                return Convert.ToInt32(strArr[1]);
            }
            else
            {
                return 1;
            }
        }
        public static int parseStockCodeProductCard(string stockCode)
        {
            if (stockCode.Contains("-"))
            {
                if (Functions.is_Bundle(stockCode))
                {
                    return 1;
                }
                else
                {
                    string[] strArr = stockCode.Split('-');
                    if (strArr[1].Contains("\""))
                    {
                        strArr[1] = strArr[1].Replace("\"", "");
                    }
                    return Convert.ToInt32(strArr[1]);
                }
            }
            else
            {
                return 1;
            }
        }
        public static int get_Bundle_Stock(string bundle_stock_Code)
        {
            var bundle_Unit_Stock_Codes = SQLFunctions.get_Bundle_Unit_Stock_Codes(bundle_stock_Code);
            if (bundle_Unit_Stock_Codes.Count > 1)
            {
                var list_Of_Stocks = new List<int>();
                foreach (var bundle_Unit_Stock_Code in bundle_Unit_Stock_Codes)
                {
                    if (Functions.is_Bundle(bundle_Unit_Stock_Code))
                    {
                        list_Of_Stocks.Add(get_Bundle_Stock(bundle_Unit_Stock_Code));
                    }
                    else
                    {
                        list_Of_Stocks.Add(SQLFunctions.getUnitStock(bundle_Unit_Stock_Code));
                    }
                }
                return list_Of_Stocks.Min();
            }
            else
            {
                return -1;
            }
        }
        public static string getBaseStockCode(string stockCode)
        {
            try
            {
                if (stockCode != null)
                {
                    if (stockCode.Contains("-"))
                    {
                        string[] strArr = stockCode.Split('-');
                        return strArr[0];
                    }
                    else
                    {
                        return stockCode;
                    }
                }
                else
                {
                    return "123456789";
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("Functions", "getBaseStockCode", exc, stock_code: stockCode);
                return "123456789";
            }
        }
        public static double getCommission(string barcode)
        {
            string columnName = Applications.TyTable.Columns[1].ColumnName;
            DataRow dataRows = Applications.TyTable.Select(columnName + "='" + barcode + "'")[0];
            return Convert.ToDouble(dataRows[2], System.Globalization.NumberFormatInfo.InvariantInfo);
        }
        public static double calcMinPrice(double unitPrice, double commission)
        {
            double cargoPrice = cargoPrice1;
            double comm = (100.0 - commission) / 100.0;
            double maxUnitPrice = ((cargoThreshold1 - 0.01) * comm - cargoPrice2);
            if (unitPrice <= maxUnitPrice)
            {
                maxUnitPrice = ((cargoThreshold2 - 0.01) * comm - cargoPrice3);
                if (unitPrice <= maxUnitPrice)
                {
                    maxUnitPrice = ((cargoThreshold3 - 0.01) * comm - cargoPrice4);
                    if (unitPrice <= maxUnitPrice)
                    {
                        cargoPrice = cargoPrice4;
                    }
                    else
                    {
                        cargoPrice = cargoPrice3;
                    }
                }
                else
                {
                    cargoPrice = cargoPrice2;
                }
            }
            return (unitPrice + cargoPrice) / comm;
        }
        public static bool is_Bundle(string stock_code)
        {
            if (stock_code.Contains("-"))
            {
                string[] strArr = stock_code.Split('-');
                if (strArr[1].Contains("k") || strArr[1].Contains("K"))
                {
                    return true;
                }
                return false;
            }
            return false;
        }
        public static double Get_price_without_expenditure(double selling_price, double commission)
        {
            double cargo_Price = cargoPrice1;
            if (selling_price < cargoThreshold1)
            {
                if (selling_price >= cargoThreshold2)
                {
                    cargo_Price = cargoPrice2;
                }
                else
                {
                    if (selling_price >= cargoThreshold3)
                    {
                        cargo_Price = cargoPrice3;
                    }
                    else
                    {
                        cargo_Price = cargoPrice4;
                    }
                }
            }
            var commission_multiplier = (100 - commission) / 100;
            var price_without_expenditure = selling_price * commission_multiplier - cargo_Price;
            return price_without_expenditure;
        }
    }

}
