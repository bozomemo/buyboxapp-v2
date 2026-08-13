using MySql.Data.MySqlClient;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Data;
using System.Windows.Forms;
using System.Xml;

namespace BuyBoxApp
{
    internal static class SQLFunctions
    {
        private static readonly string MysqlConnectionString = string.Empty;
        static SQLFunctions()
        {
            MysqlConnectionString = Properties.Settings.Default.MysqlConnectionString;
            

        }
        public static void Deneme()
        {

        }
        public static void Fill_Stock_Table()
        {
            try
            {
                Applications.Stock_Table.Clear();
                using (MySqlConnection mySqlConnection = new MySqlConnection(MysqlConnectionString))
                {
                    mySqlConnection.Open();
                    using (MySqlDataAdapter mySqlDataAdapter = new MySqlDataAdapter(new MySqlCommand { CommandText = "SELECT * FROM vwstocktable", CommandType = CommandType.Text, Connection = mySqlConnection, CommandTimeout = 99999 }))
                    {
                        mySqlDataAdapter.Fill(Applications.Stock_Table);
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "Fill_Stock_Table", exc);
            }
        }
        public static void Fill_Product_Card_Table()
        {
            try
            {
                Applications.TyProduct_Card_Table.Clear();
                using (MySqlConnection mySqlConnection = new MySqlConnection(MysqlConnectionString))
                {
                    mySqlConnection.Open();
                    using (MySqlDataAdapter mySqlDataAdapter = new MySqlDataAdapter("select * from trendyol_product_cards", mySqlConnection))
                    {
                        mySqlDataAdapter.Fill(Applications.TyProduct_Card_Table);
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "Fill_Product_Card_Table", exc);
            }
        }
        public static bool Get_product_card_inc(string barcode)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "select Increase_Price from trendyol_product_cards where Barcode = @Barcode";
                        mySqlCommand.Parameters.AddWithValue("@Barcode", barcode);
                        return Convert.ToBoolean(mySqlCommand.ExecuteScalar());
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "Get_product_card_inc", exc, barcode: barcode);
                return false;
            }
        }
        public static void Edit_product_card_inc(string barcode, bool changed_value)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "update trendyol_product_cards set Increase_Price = @changed_value where Barcode = @Barcode";
                        mySqlCommand.Parameters.AddWithValue("@Barcode", barcode);
                        mySqlCommand.Parameters.AddWithValue("@changed_value", changed_value);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "Edit_product_card_inc", exc, barcode: barcode);
            }
        }
        public static bool Get_product_card_decr(string barcode)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "select Decrease_Price from trendyol_product_cards where Barcode = @Barcode";
                        mySqlCommand.Parameters.AddWithValue("@Barcode", barcode);
                        return Convert.ToBoolean(mySqlCommand.ExecuteScalar());
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "Get_product_card_decr", exc, barcode: barcode);
                return false;
            }
        }
        public static void Edit_product_card_decr(string barcode, bool changed_value)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "update trendyol_product_cards set Decrease_Price = @changed_value where Barcode = @Barcode";
                        mySqlCommand.Parameters.AddWithValue("@Barcode", barcode);
                        mySqlCommand.Parameters.AddWithValue("@changed_value", changed_value);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "Edit_product_card_decr", exc, barcode: barcode);
            }
        }
        public static void edit_special_price_multiplier(string stock_code, double changed_value)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "update stock_table set Special_Price_Multiplier = @changed_value where Stock_Code = @stock_Code";
                        mySqlCommand.Parameters.AddWithValue("@stock_Code", stock_code);
                        mySqlCommand.Parameters.AddWithValue("@changed_value", changed_value);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "edit_special_price_multiplier", exc, stock_code: stock_code);
            }
        }
        public static void edit_AutoBB(string stock_code, bool changed_value)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "update stock_table set Automated_Buybox = @changed_value where Stock_Code = @stock_Code";
                        mySqlCommand.Parameters.AddWithValue("@stock_Code", stock_code);
                        mySqlCommand.Parameters.AddWithValue("@changed_value", changed_value);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "edit_AutoBB", exc, stock_code: stock_code);
            }
        }
        public static bool? check_If_AutoBB(string stock_code)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "select Automated_Buybox from stock_table where Stock_Code = @stock_Code";
                        mySqlCommand.Parameters.AddWithValue("@stock_Code", stock_code);
                        return (bool?)mySqlCommand.ExecuteScalar();
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "check_If_AutoBB", exc, stock_code: stock_code);
                return null;
            }
        }
        public static void Insert_Trace_Optimum_Price(AutomateWorks.TYAutoBB.Optimum_Price_Values optimum_Price_Values)
        {
            /// <summary>
            /// bcsp = Before_Change_Selling_Price
            /// acsp = After_Change_Selling_Price
            /// bcib = Before_Change_In_Buybox
            /// bcbprc = Before_Change_Buybox_Price
            /// bcbprm = Before_Change_Buybox_Promotions
            /// ssprc = Second_Seller_Price
            /// ssprm = Second_Seller_Promotions
            /// </summary>
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "INSERT INTO trace_optimum_price (Barcode, Current_Unit_Price, Before_Change_Selling_Price, After_Change_Selling_Price, " +
                            "Before_Change_In_Buybox, Before_Change_Buybox_Price, Before_Change_Buybox_Promotions, Second_Seller_Price, Second_Seller_Promotions, BeforeChangeCommissionRate, Last_Change_Time) " +
                            "VALUES (@Barcode, @Current_Unit_Price, @Before_Change_Selling_Price, @After_Change_Selling_Price, @Before_Change_In_Buybox, " +
                            "@Before_Change_Buybox_Price, @Before_Change_Buybox_Promotions, @Second_Seller_Price, @Second_Seller_Promotions, @BeforeChangeCommissionRate, @Last_Change_Time)";
                        mySqlCommand.Parameters.AddWithValue("@Barcode", optimum_Price_Values.Barcode);
                        mySqlCommand.Parameters.AddWithValue("@Current_Unit_Price", optimum_Price_Values.cuprc);
                        mySqlCommand.Parameters.AddWithValue("@Before_Change_Selling_Price", optimum_Price_Values.bcsp);
                        mySqlCommand.Parameters.AddWithValue("@After_Change_Selling_Price", optimum_Price_Values.acsp);
                        mySqlCommand.Parameters.AddWithValue("@Before_Change_In_Buybox", optimum_Price_Values.bcib);
                        mySqlCommand.Parameters.AddWithValue("@Before_Change_Buybox_Price", optimum_Price_Values.bcbprc);
                        mySqlCommand.Parameters.AddWithValue("@Before_Change_Buybox_Promotions", optimum_Price_Values.bcbprm);
                        mySqlCommand.Parameters.AddWithValue("@Second_Seller_Price", optimum_Price_Values.ssprc);
                        mySqlCommand.Parameters.AddWithValue("@Second_Seller_Promotions", optimum_Price_Values.ssprm);
                        mySqlCommand.Parameters.AddWithValue("@BeforeChangeCommissionRate", optimum_Price_Values.bccr);
                        mySqlCommand.Parameters.AddWithValue("@Last_Change_Time", DateTime.Now);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "Insert_Trace_Optimum_Price", exc, barcode: optimum_Price_Values.Barcode);
            }
        }
        public static int getUnitStock(string stockCode)
        {
            try
            {
                if (stockCode.Contains("-"))
                {
                    if (Functions.is_Bundle(stockCode))
                    {
                        return Functions.get_Bundle_Stock(stockCode);
                    }
                    else
                    {
                        string[] strArr = stockCode.Split('-');
                        stockCode = strArr[0];
                    }
                }
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "Select Unit_Stock from stock_table where Stock_Code = @stock_Code";
                        mySqlCommand.Parameters.AddWithValue("@stock_Code", stockCode);
                        var unit_Stock = mySqlCommand.ExecuteScalar();
                        int to_return = -1;
                        if (unit_Stock != null)
                        {
                            to_return = (int)unit_Stock;
                        }
                        return to_return;
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "getUnitStock", exc, stock_code: stockCode);
                return -1;
            }

        }

        /// <summary>
        /// Gets stock codes of units in bundle.
        /// </summary>
        /// <param name="bundle_stock_Code"></param>
        /// <returns> 
        /// string value that holds stock
        /// codes of units in bundle. 
        /// </returns>
        /// 
        //public static List<string> get_Bundle_Unit_Stock_Codes(string bundle_Stock_Code)
        //{
        //    try
        //    {
        //        using (MySqlConnection mySqlConnection = new MySqlConnection())
        //        {
        //            mySqlConnection.ConnectionString = Properties.Settings.Default.MySqlConnStr;
        //            mySqlConnection.Open();
        //            using (MySqlCommand mySqlCommand = new MySqlCommand())
        //            {
        //                mySqlCommand.CommandType = CommandType.Text;
        //                mySqlCommand.Connection = mySqlConnection;
        //                mySqlCommand.CommandText = "select Bundle_Unit_Stock_Code from " + mysql_bundle_table_name + " where Bundle_Stock_Code = @bndl_stck_code";
        //                mySqlCommand.Parameters.AddWithValue("@bndl_stck_code", bundle_Stock_Code);
        //                var mySqlDataReader = mySqlCommand.ExecuteReader();
        //                var list_To_Return = new List<string>();
        //                list_To_Return.Add(Functions.getBaseStockCode(bundle_Stock_Code));
        //                while (mySqlDataReader.Read())
        //                {
        //                    list_To_Return.Add(mySqlDataReader["Bundle_Unit_Stock_Code"].ToString());
        //                }
        //                return list_To_Return;
        //            }
        //        }
        //    }
        //    catch (Exception exc)
        //    {
        //        Write_log("SQLFunctions", "get_Bundle_Unit_Stock_Codes", exc, stock_code: bundle_Stock_Code);
        //        return new List<string>();
        //    }
        //}
        public static List<string> get_Bundle_Unit_Stock_Codes(string bundle_Stock_Code)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandText = "select BundleUnitStockCodes from bundletablev2 where BundleStockCode = @BundleStockCode";
                        mySqlCommand.Parameters.AddWithValue("@BundleStockCode", bundle_Stock_Code);
                        var bundleUnitStockCodes = mySqlCommand.ExecuteScalar();
                        if (bundleUnitStockCodes != null)
                        {
                            var stockCodeArr = bundleUnitStockCodes.ToString().Split('|');
                            return new List<string>(stockCodeArr);
                        }
                        else
                        {
                            return new List<string>();
                        }
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "get_Bundle_Unit_Stock_Codes", exc, stock_code: bundle_Stock_Code);
                return new List<string>();
            }
        }
        public static double getUnitPrice(string stockCode, bool get_org_price = false)
        {
            try
            {
                var total_price = 0.0;
                bool is_Bundle = Functions.is_Bundle(stockCode);
                if (is_Bundle)
                {
                    var list_Of_Stock_Codes = get_Bundle_Unit_Stock_Codes(stockCode);
                    if (list_Of_Stock_Codes.Count > 1)
                    {
                        foreach (var stock_code in list_Of_Stock_Codes)
                        {
                            total_price += getUnitPrice(stock_code);
                        }
                        return total_price;
                    }
                    else
                    {
                        return 999f;
                    }
                }
                else
                {
                    int unit_Count = Functions.parseStockCode(stockCode);
                    using (MySqlConnection mySqlConnection = new MySqlConnection())
                    {
                        mySqlConnection.ConnectionString = MysqlConnectionString;
                        mySqlConnection.Open();
                        using (MySqlCommand mySqlCommand = new MySqlCommand())
                        {
                            mySqlCommand.Connection = mySqlConnection;
                            mySqlCommand.CommandType = CommandType.Text;
                            mySqlCommand.CommandText = "Select Unit_Price from stock_table where Stock_Code = @stock_Code";
                            mySqlCommand.Parameters.AddWithValue("@stock_Code", Functions.getBaseStockCode(stockCode));
                            var unit_Price = Convert.ToDouble(mySqlCommand.ExecuteScalar());
                            if (!get_org_price)
                            {
                                unit_Price *= get_SpecialPrice_Multiplier(Functions.getBaseStockCode(stockCode));
                            }
                            return unit_Price * unit_Count;
                        }
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "getUnitPrice", exc, stock_code: stockCode);
                return 999;
            }
        }
        public static void updateOrInsert(TYProductCard productCard)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = MysqlConnectionString;
                    mySqlConnection.Open();
                    if (mySqlConnection.State == ConnectionState.Open)
                    {
                        using (MySqlCommand mySqlCommand = new MySqlCommand())
                        {
                            mySqlCommand.CommandType = CommandType.Text;
                            mySqlCommand.Connection = mySqlConnection;
                            mySqlCommand.CommandText = "INSERT INTO trendyol_product_cards (Brand, Category, Barcode, Product_Card_Name, Product_Card_Unit_Price, " +
                                "Original_Unit_Price, Model_Code, Seller_Stock_Code, List_Price, Commission, Trendyol_Selling_Price, " +
                                "Lowest_Sellable_Price, Selling_Stock, Unit_Total_Stock, BuyBox_Seller_Name, BuyBox_Seller_Price, Second_Seller_Name, " +
                                "Second_Seller_Price, Third_Seller_Name, Third_Seller_Price, Fourth_Seller_Name, Fourth_Seller_Price, Fifth_Seller_Name, " +
                                "Fifth_Seller_Price, Product_Comment_Count, Product_Rating_Count, BuyBox_Price_Difference, Second_Seller_Price_Difference, " +
                                "Average_Selling_Price, On_Sale, In_BuyBox, Under_Lowest_Sellable_Price, Stock_Out, Main_Product_Card, Blacklisted, " +
                                "Rejected, Locked, Auto_BB, Increase_Price, Decrease_Price, Product_Content_Id, Last_Update_Date, Product_Json_Text, Buybox_Seller_Json, Other_Sellers_Json) " +
                                "VALUES (@Brand, @Category, @Barcode, @Product_Card_Name, @Product_Card_Unit_Price, @Original_Unit_Price, @Model_Code, " +
                                "@Seller_Stock_Code, @List_Price, @Commission, @Trendyol_Selling_Price, @Lowest_Sellable_Price, @Selling_Stock, " +
                                "@Unit_Total_Stock, @BuyBox_Seller_Name, @BuyBox_Seller_Price, @Second_Seller_Name, @Second_Seller_Price, @Third_Seller_Name, " +
                                "@Third_Seller_Price, @Fourth_Seller_Name, @Fourth_Seller_Price, @Fifth_Seller_Name, @Fifth_Seller_Price, @Product_Comment_Count, " +
                                "@Product_Rating_Count, @BuyBox_Price_Difference, @Second_Seller_Price_Difference, @Average_Selling_Price, @On_Sale, " +
                                "@In_BuyBox, @Under_Lowest_Sellable_Price, @Stock_Out, @Main_Product_Card, @Blacklisted, @Rejected, @Locked, @Auto_BB, " +
                                "@Increase_Price, @Decrease_Price, @Product_Content_Id, @Last_Update_Date, @Product_Json_Text ,@Buybox_Seller_Json, @Other_Sellers_Json) " +
                                "ON DUPLICATE KEY UPDATE Brand=@Brand,Category=@Category,Product_Card_Name=@Product_Card_Name," +
                                "Product_Card_Unit_Price=@Product_Card_Unit_Price,Original_Unit_Price=@Original_Unit_Price,Model_Code=@Model_Code," +
                                "Seller_Stock_Code=@Seller_Stock_Code,List_Price=@List_Price,Commission=@Commission,Trendyol_Selling_Price=@Trendyol_Selling_Price," +
                                "Lowest_Sellable_Price=@Lowest_Sellable_Price,Selling_Stock=@Selling_Stock,Unit_Total_Stock=@Unit_Total_Stock," +
                                "BuyBox_Seller_Name=@BuyBox_Seller_Name,BuyBox_Seller_Price=@BuyBox_Seller_Price,Second_Seller_Name=@Second_Seller_Name," +
                                "Second_Seller_Price=@Second_Seller_Price,Third_Seller_Name=@Third_Seller_Name,Third_Seller_Price=@Third_Seller_Price," +
                                "Fourth_Seller_Name=@Fourth_Seller_Name,Fourth_Seller_Price=@Fourth_Seller_Price,Fifth_Seller_Name=@Fifth_Seller_Name," +
                                "Fifth_Seller_Price=@Fifth_Seller_Price,Product_Comment_Count=@Product_Comment_Count,Product_Rating_Count=@Product_Rating_Count," +
                                "BuyBox_Price_Difference=@BuyBox_Price_Difference,Second_Seller_Price_Difference=@Second_Seller_Price_Difference," +
                                "Average_Selling_Price=@Average_Selling_Price,On_Sale=@On_Sale,In_BuyBox=@In_BuyBox," +
                                "Under_Lowest_Sellable_Price=@Under_Lowest_Sellable_Price,Stock_Out=@Stock_Out,Main_Product_Card=@Main_Product_Card," +
                                "Blacklisted=@Blacklisted,Rejected=@Rejected,Locked=@Locked,Product_Content_Id=@Product_Content_Id," +
                                "Last_Update_Date=@Last_Update_Date,Product_Json_Text=@Product_Json_Text,Buybox_Seller_Json=@Buybox_Seller_Json," +
                                "Other_Sellers_Json=@Other_Sellers_Json;";


                            if (!productCard.errorOccurred)
                            {
                                mySqlCommand.Parameters.AddWithValue("@Brand", productCard.brand);
                                mySqlCommand.Parameters.AddWithValue("@Category", productCard.category);
                                mySqlCommand.Parameters.AddWithValue("@Barcode", productCard.barcode);
                                mySqlCommand.Parameters.AddWithValue("@Product_Card_Name", productCard.productName);
                                mySqlCommand.Parameters.AddWithValue("@Product_Card_Unit_Price", productCard.unitPrice);
                                mySqlCommand.Parameters.AddWithValue("@Original_Unit_Price", productCard.original_unit_price);
                                mySqlCommand.Parameters.AddWithValue("@Commission", productCard.commission);
                                mySqlCommand.Parameters.AddWithValue("@Model_Code", productCard.modelCode);
                                mySqlCommand.Parameters.AddWithValue("@Seller_Stock_Code", productCard.sellerStockCode);
                                mySqlCommand.Parameters.AddWithValue("@List_Price", productCard.list_price);
                                mySqlCommand.Parameters.AddWithValue("@Trendyol_Selling_Price", productCard.trendyolSellingPrice);
                                mySqlCommand.Parameters.AddWithValue("@Lowest_Sellable_Price", productCard.lowestSellablePrice);
                                mySqlCommand.Parameters.AddWithValue("@Selling_Stock", productCard.sellingStock);
                                mySqlCommand.Parameters.AddWithValue("@Unit_Total_Stock", productCard.unitTotalStock);
                                mySqlCommand.Parameters.AddWithValue("@Buybox_Seller_Json", JsonConvert.SerializeObject(productCard.buyBoxSeller));
                                mySqlCommand.Parameters.AddWithValue("@BuyBox_Seller_Name", productCard.buyBoxSeller.name);
                                var buyBox_Price = productCard.buyBoxSeller.has_Basket_Discount ?
                                    productCard.buyBoxSeller.basket_Discount_Price :
                                    productCard.buyBoxSeller.selling_Price;
                                mySqlCommand.Parameters.AddWithValue("@BuyBox_Seller_Price", buyBox_Price);
                                mySqlCommand.Parameters.AddWithValue("@Other_Sellers_Json", JsonConvert.SerializeObject(productCard.other_Sellers));
                                var second_Seller_name = productCard.second_Seller == null ? "No Seller" : productCard.second_Seller.name;
                                mySqlCommand.Parameters.AddWithValue("@Second_Seller_Name", second_Seller_name);
                                var second_Seller_Price = -1.0;
                                if (productCard.other_Sellers.Count > 0)
                                {
                                    second_Seller_Price = productCard.second_Seller.has_Basket_Discount ?
                                    productCard.second_Seller.basket_Discount_Price :
                                    productCard.second_Seller.selling_Price;
                                }
                                mySqlCommand.Parameters.AddWithValue("@Second_Seller_Price", second_Seller_Price);
                                var third_seller_name = productCard.third_Seller == null ? "No Seller" : productCard.third_Seller.name;
                                mySqlCommand.Parameters.AddWithValue("@Third_Seller_Name", third_seller_name);
                                var third_Seller_Price = -1.0;
                                if (productCard.other_Sellers.Count > 1)
                                {
                                    third_Seller_Price = productCard.third_Seller.has_Basket_Discount ?
                                    productCard.third_Seller.basket_Discount_Price :
                                    productCard.third_Seller.selling_Price;
                                }
                                mySqlCommand.Parameters.AddWithValue("@Third_Seller_Price", third_Seller_Price);
                                var fourth_Seller_name = productCard.fourth_Seller == null ? "No Seller" : productCard.fourth_Seller.name;
                                mySqlCommand.Parameters.AddWithValue("@Fourth_Seller_Name", fourth_Seller_name);
                                var fourth_Seller_Price = -1.0;
                                if (productCard.other_Sellers.Count > 2)
                                {
                                    fourth_Seller_Price = productCard.fourth_Seller.has_Basket_Discount ?
                                    productCard.fourth_Seller.basket_Discount_Price :
                                    productCard.fourth_Seller.selling_Price;
                                }
                                mySqlCommand.Parameters.AddWithValue("@Fourth_Seller_Price", fourth_Seller_Price);
                                var fifth_Seller_name = productCard.fifth_Seller == null ? "No Seller" : productCard.fifth_Seller.name;
                                mySqlCommand.Parameters.AddWithValue("@Fifth_Seller_Name", fifth_Seller_name);
                                var fifth_Seller_Price = -1.0;
                                if (productCard.other_Sellers.Count > 3)
                                {
                                    fifth_Seller_Price = productCard.fifth_Seller.has_Basket_Discount ?
                                    productCard.fifth_Seller.basket_Discount_Price :
                                    productCard.fifth_Seller.selling_Price;
                                }
                                mySqlCommand.Parameters.AddWithValue("@Fifth_Seller_Price", fifth_Seller_Price);
                                mySqlCommand.Parameters.AddWithValue("@Product_Comment_Count", productCard.commentCount);
                                mySqlCommand.Parameters.AddWithValue("@Product_Rating_Count", productCard.ratingCount);
                                mySqlCommand.Parameters.AddWithValue("@BuyBox_Price_Difference", productCard.priceDifference);
                                mySqlCommand.Parameters.AddWithValue("@Second_Seller_Price_Difference", productCard.priceDifferenceSecond);
                                mySqlCommand.Parameters.AddWithValue("@Average_Selling_Price", productCard.average_Price);
                                mySqlCommand.Parameters.AddWithValue("@On_Sale", productCard.onSale);
                                mySqlCommand.Parameters.AddWithValue("@In_BuyBox", productCard.inBuyBox);
                                mySqlCommand.Parameters.AddWithValue("@Under_Lowest_Sellable_Price", productCard.underLowestSellablePrice);
                                mySqlCommand.Parameters.AddWithValue("@Stock_Out", productCard.stock_Out);
                                mySqlCommand.Parameters.AddWithValue("@Main_Product_Card", productCard.mainProductCard);
                                mySqlCommand.Parameters.AddWithValue("@Blacklisted", productCard.blackListed);
                                mySqlCommand.Parameters.AddWithValue("@Rejected", productCard.rejected);
                                mySqlCommand.Parameters.AddWithValue("@Locked", productCard.locked);
                                mySqlCommand.Parameters.AddWithValue("@Auto_BB", true);
                                mySqlCommand.Parameters.AddWithValue("@Increase_Price", true);
                                mySqlCommand.Parameters.AddWithValue("@Decrease_Price", true);
                                mySqlCommand.Parameters.AddWithValue("@Product_Content_Id", productCard.productContentId);
                                mySqlCommand.Parameters.AddWithValue("@Last_Update_Date", productCard.last_Update_Date);
                                mySqlCommand.Parameters.AddWithValue("@Product_Json_Text", productCard.product_json_text);
                                mySqlCommand.ExecuteNonQuery();
                            }
                        }
                    }
                }
            }
            catch (MySqlException exc)
            {
                Write_log("SQLFunctions", "updateOrInsert", exc, stock_code: productCard.sellerStockCode, barcode: productCard.barcode);
            }
        }
        public static void updateOrInsertStocks(DataRow dataRow)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandText = "INSERT INTO stock_table (Stock_Code, Product_Name, Unit_Price, Unit_Stock, Total_Selling_Stock, " +
                            "Special_Price_Multiplier, HbSpecialPriceMultiplier, Automated_Buybox, HbAutomatedBuybox) VALUES (@Stock_Code, @Product_Name, @Unit_Price, @Unit_Stock, @Total_Selling_Stock, " +
                            "@Special_Price_Multiplier, @HbSpecialPriceMultiplier, @Automated_Buybox,@HbAutomatedBuybox) ON DUPLICATE KEY UPDATE Product_Name=@Product_Name, " +
                            "Unit_Price=@Unit_Price, Unit_Stock=@Unit_Stock, Total_Selling_Stock=@Total_Selling_Stock";
                        mySqlCommand.Parameters.AddWithValue("@Stock_Code", dataRow["KODU"].ToString());
                        mySqlCommand.Parameters.AddWithValue("@Product_Name", dataRow["ADI"].ToString());
                        mySqlCommand.Parameters.AddWithValue("@Unit_Price", Convert.ToDouble(dataRow["Standart_Maliyet"]));
                        int unit_Stock = Convert.ToInt32((dataRow["TOPLAM MIKTAR"]));
                        mySqlCommand.Parameters.AddWithValue("@Unit_Stock", unit_Stock);
                        mySqlCommand.Parameters.AddWithValue("@Special_price_multiplier", 1);
                        mySqlCommand.Parameters.AddWithValue("@HbSpecialPriceMultiplier", 1);
                        mySqlCommand.Parameters.AddWithValue("@Automated_Buybox", 1);
                        mySqlCommand.Parameters.AddWithValue("@HbAutomatedBuybox", 0);
                        int total_Selling_Count = getTotalSellingCount(dataRow["KODU"].ToString());
                        mySqlCommand.Parameters.AddWithValue("@Total_Selling_Stock", total_Selling_Count);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "updateOrInsertStocks", exc, stock_code: dataRow["KODU"].ToString());
            }
        }
        /// <summary>
        /// Updates SQL table according to Excel File Selected.
        /// </summary>
        public static int getTotalSellingCount(string stock_code)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "Select distinct Seller_Stock_Code from trendyol_product_cards where Seller_Stock_Code like @stock_code";
                        mySqlCommand.Parameters.AddWithValue("@stock_code", stock_code + "%");
                        mySqlCommand.Connection = mySqlConnection;
                        using (var mySqlDataReader = mySqlCommand.ExecuteReader())
                        {
                            var total_selling_count = 0;
                            while (mySqlDataReader.Read())
                            {
                                total_selling_count += get_selling_count(mySqlDataReader[0].ToString());
                                if (!Functions.is_Bundle(mySqlDataReader[0].ToString())) set_Main_Product_Card(mySqlDataReader[0].ToString());
                            }
                            return total_selling_count;
                        }
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "getTotalSellingCount", exc, stock_code: stock_code);
                return -1;
            }
        }
        /// <summary>
        /// Get total selling quantity of product cards
        /// Also invokes the method to set main product card
        /// </summary>
        /// <param name="stockCode"></param>
        /// <returns> Total selling quantity of product</returns>
        public static int get_selling_count(string stock_code)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "Select sum(Selling_Stock) from trendyol_product_cards where Seller_Stock_Code = @stock_code";
                        mySqlCommand.Parameters.AddWithValue("@stock_code", stock_code);
                        mySqlCommand.Connection = mySqlConnection;
                        var result = Convert.ToInt32(mySqlCommand.ExecuteScalar());
                        var count = Functions.parseStockCodeProductCard(stock_code);
                        return result * count;
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "get_selling_count", exc, stock_code: stock_code);
                return -1;
            }
        }

        public static double get_SpecialPrice_Multiplier(string stock_Code)
        {
            using (MySqlConnection mySqlConnection = new MySqlConnection())
            {
                mySqlConnection.ConnectionString = MysqlConnectionString;
                mySqlConnection.Open();
                using (MySqlCommand mySqlCommand = new MySqlCommand())
                {
                    mySqlCommand.CommandType = CommandType.Text;
                    mySqlCommand.Connection = mySqlConnection;
                    mySqlCommand.CommandText = "Select Special_Price_Multiplier from stock_table where Stock_Code = @stock_Code";
                    mySqlCommand.Parameters.AddWithValue("@stock_Code", stock_Code);
                    return Convert.ToDouble(mySqlCommand.ExecuteScalar());
                }
            }
        }
        public static void set_Main_Product_Card(string stock_code)
        {
            using (MySqlConnection mySqlConnection = new MySqlConnection())
            {
                mySqlConnection.ConnectionString = MysqlConnectionString;
                mySqlConnection.Open();
                using (MySqlCommand mySqlCommand = new MySqlCommand())
                {
                    var barcode = get_main_product_card(stock_code);
                    mySqlCommand.CommandType = CommandType.Text;
                    mySqlCommand.Connection = mySqlConnection;
                    mySqlCommand.CommandText = "update trendyol_product_cards set Main_Product_Card=@value where Barcode=@barcode";
                    mySqlCommand.Parameters.AddWithValue("@value", true);
                    mySqlCommand.Parameters.AddWithValue("@barcode", barcode);
                    mySqlCommand.ExecuteNonQuery();
                }
            }
        }
        public static string get_main_product_card(string stock_code)
        {
            using (MySqlConnection mySqlConnection = new MySqlConnection())
            {
                mySqlConnection.ConnectionString = MysqlConnectionString;
                mySqlConnection.Open();
                using (MySqlCommand mySqlCommand = new MySqlCommand())
                {
                    mySqlCommand.CommandType = CommandType.Text;
                    mySqlCommand.Connection = mySqlConnection;
                    mySqlCommand.CommandText = "select Barcode,Product_Rating_Count from trendyol_product_cards where " +
                        "Seller_Stock_Code = @stock_code order by Product_Rating_Count desc limit 1";
                    mySqlCommand.Parameters.AddWithValue("@stock_code", stock_code);
                    return mySqlCommand.ExecuteScalar().ToString();
                }
            }
        }
        public static AutomateWorks.TYAutoBB.Optimum_Price_Values GetOptimum_Price_Values(string barcode)
        {
            using (MySqlConnection mySqlConnection = new MySqlConnection())
            {
                mySqlConnection.ConnectionString = MysqlConnectionString;
                mySqlConnection.Open();
                using (MySqlCommand mySqlCommand = new MySqlCommand())
                {
                    mySqlCommand.CommandType = CommandType.Text;
                    mySqlCommand.Connection = mySqlConnection;
                    mySqlCommand.CommandText = "select * from trace_optimum_price where Barcode = @Barcode order by Last_Change_Time desc limit 1;";
                    mySqlCommand.Parameters.AddWithValue("@Barcode", barcode);
                    using (MySqlDataReader mySqlDataReader = mySqlCommand.ExecuteReader())
                    {
                        if (mySqlDataReader.Read())
                        {
                            var cuprc = Convert.ToDouble(mySqlDataReader["Current_Unit_Price"]);
                            var bcsp = Convert.ToDouble(mySqlDataReader["Before_Change_Selling_Price"]);
                            var acsp = Convert.ToDouble(mySqlDataReader["After_Change_Selling_Price"]);
                            var bcib = Convert.ToBoolean(mySqlDataReader["Before_Change_In_Buybox"]);
                            var bcbprc = Convert.ToDouble(mySqlDataReader["Before_Change_Buybox_Price"]);
                            var bcbprm = mySqlDataReader["Before_Change_Buybox_Price"].ToString();
                            var ssprc = Convert.ToDouble(mySqlDataReader["Second_Seller_Price"]);
                            var ssprm = mySqlDataReader["Second_Seller_Promotions"].ToString();
                            var commissionRate = mySqlDataReader["BeforeChangeCommissionRate"];
                            var bccr = commissionRate != DBNull.Value ? Convert.ToDouble(commissionRate) : 16.0;
                            return new AutomateWorks.TYAutoBB.Optimum_Price_Values
                            {
                                cuprc = cuprc,
                                bcsp = bcsp,
                                acsp = acsp,
                                bcib = bcib,
                                bcbprc = bcbprc,
                                bcbprm = bcbprm,
                                ssprc = ssprc,
                                ssprm = ssprm,
                                bccr = bccr
                            };
                        }
                        else
                        {
                            return new AutomateWorks.TYAutoBB.Optimum_Price_Values();
                        }
                    }
                }
            }
        }
        public static void AddGGCategory(XmlNode xmlNode, string parentCategoryNode)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandText = "INSERT INTO ggcategories (CategoryCode, ParentCategoryCode, CategoryName, HasCatalog, Deepest, ShippingTimes) VALUES (@CategoryCode, @ParentCategoryCode, @CategoryName, @HasCatalog, @Deepest, @ShippingTimes) ON DUPLICATE KEY UPDATE ParentCategoryCode=@ParentCategoryCode , CategoryName = @CategoryName,HasCatalog= @HasCatalog, Deepest = @Deepest, ShippingTimes = @ShippingTimes";
                        mySqlCommand.Parameters.AddWithValue("CategoryCode", xmlNode.SelectSingleNode("categoryCode").InnerText);
                        mySqlCommand.Parameters.AddWithValue("ParentCategoryCode", parentCategoryNode);
                        mySqlCommand.Parameters.AddWithValue("CategoryName", xmlNode.SelectSingleNode("categoryName").InnerText);
                        mySqlCommand.Parameters.AddWithValue("HasCatalog", xmlNode.Attributes["hasCatalog"].Value == "true");
                        mySqlCommand.Parameters.AddWithValue("Deepest", xmlNode.Attributes["deepest"].Value == "true");
                        var shippingTimesStr = string.Empty;
                        foreach (XmlNode shippingTimeNode in xmlNode.SelectSingleNode("shippingTimes").ChildNodes)
                        {
                            shippingTimesStr += shippingTimeNode.InnerText + "|";
                        }
                        if (shippingTimesStr.Contains("|")) shippingTimesStr = shippingTimesStr.Remove(shippingTimesStr.Length - 1);
                        mySqlCommand.Parameters.AddWithValue("ShippingTimes", shippingTimesStr);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "AddGGCategory", exc);
            }
        }
        public static void AddGGCategorySpec(XmlNode specNode, string categoryCode)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandText = "DELETE FROM ggcategoryspecs WHERE SpecName= @SpecName AND GGCategoryCode = @GGCategoryCode;INSERT INTO GGCategorySpecs (GGCategoryCode, SpecType, SpecRequired, SpecName, SpecValues) VALUES (@GGCategoryCode, @SpecType, @SpecRequired, @SpecName, @SpecValues);";
                        mySqlCommand.Parameters.AddWithValue("GGCategoryCode", categoryCode);
                        mySqlCommand.Parameters.AddWithValue("SpecType", specNode.Attributes["type"].Value);
                        mySqlCommand.Parameters.AddWithValue("SpecRequired", specNode.Attributes["required"].Value == "true");
                        mySqlCommand.Parameters.AddWithValue("SpecName", specNode.Attributes["name"].Value);
                        var specValues = string.Empty;
                        foreach (XmlNode specValue in specNode.SelectSingleNode("values").ChildNodes)
                        {
                            specValues += specValue.InnerText + "|";
                        }
                        if (specValues.Contains("|")) specValues = specValues.Remove(specValues.Length - 1);
                        mySqlCommand.Parameters.AddWithValue("SpecValues", specValues);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "AddGGCategorySpec", exc);
            }
        }
        internal static void RefreshBundleTable()
        {
            try
            {
                var bundleTable = new DataTable();
                using (var mysqlConnection = new MySqlConnection())
                {
                    mysqlConnection.ConnectionString = "REDACTED";
                    mysqlConnection.Open();
                    using (var mysqlCommand = new MySqlCommand())
                    {
                        mysqlCommand.Connection = mysqlConnection;
                        mysqlCommand.CommandText = "TRUNCATE TABLE buyboxapp.bundletablev2;";
                        mysqlCommand.ExecuteNonQuery();
                    }
                    using (var mysqlDataAdapter = new MySqlDataAdapter(new MySqlCommand("SELECT * FROM teyentegrasyon.tblteystoklar where stokKodu like '%-k%';", mysqlConnection)))
                    {
                        mysqlDataAdapter.Fill(bundleTable);
                    }
                    foreach (DataRow dataRow in bundleTable.Rows)
                    {
                        var bundleStockCode = dataRow["stokKodu"].ToString();
                        var baseStockCode = bundleStockCode.Split('-')[0].Trim();
                        var baseProductName = dataRow["stokERPAdi"].ToString();
                        var tempTable = new DataTable();
                        using (MySqlDataAdapter mySqlDataAdapter = new MySqlDataAdapter(new MySqlCommand($"SELECT * FROM teyentegrasyon.tblstokbagliurunler where stokID = '{dataRow["stokID"]}';", mysqlConnection)))
                        {
                            mySqlDataAdapter.Fill(tempTable);
                        }
                        var bundleUnitStockCodes = baseStockCode + "-1";
                        var bundleUnitProductNames = baseProductName;
                        foreach (DataRow tempRow in tempTable.Rows)
                        {
                            bundleUnitStockCodes += "|" + tempRow["pyUrunKodu"].ToString() + "-1";
                            bundleUnitProductNames += "|" + tempRow["pyUrunAdi"].ToString();
                        }
                        using (MySqlCommand mySqlCommand = new MySqlCommand())
                        {
                            mySqlCommand.Connection = mysqlConnection;
                            mySqlCommand.CommandText = "insert into buyboxapp.bundletablev2 (BundleStockCode,BundleUnitStockCodes,BundleUnitProductNames) values (@BundleStockCode,@BundleUnitStockCodes,@BundleUnitProductNames)";
                            mySqlCommand.Parameters.AddWithValue("@BundleStockCode", bundleStockCode);
                            mySqlCommand.Parameters.AddWithValue("@BundleUnitStockCodes", bundleUnitStockCodes);
                            mySqlCommand.Parameters.AddWithValue("@BundleUnitProductNames", bundleUnitProductNames);
                            mySqlCommand.ExecuteNonQuery();
                        }
                    }
                }
            }
            catch (Exception exc)
            {
                Write_log("SQLFunctions", "RefreshBundleTable", exc);
            }
        }
        public static void Write_log(string class_name, string method_name, Exception exception, string stock_code = "", string barcode = "")
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandText = "INSERT INTO log_table (Class_Name, Method_Name, Exception_Type, Exception_Message, Inner_Exception_Type, Inner_Exception_Message, Thrown_Time, Stock_Code, Barcode) " +
                            "VALUES (@Class_Name, @Method_Name, @Exception_Type, @Exception_Message, @Inner_Exception_Type, @Inner_Exception_Message, @Thrown_Time, @Stock_Code, @Barcode)";
                        mySqlCommand.Parameters.AddWithValue("@Class_Name", class_name);
                        mySqlCommand.Parameters.AddWithValue("@Method_Name", method_name);
                        mySqlCommand.Parameters.AddWithValue("@Exception_Type", exception.GetType().ToString());
                        mySqlCommand.Parameters.AddWithValue("@Exception_Message", exception.Message);
                        mySqlCommand.Parameters.AddWithValue("@Inner_Exception_Type", exception.InnerException == null ? string.Empty : exception.InnerException.GetType().ToString());
                        mySqlCommand.Parameters.AddWithValue("@Inner_Exception_Message", exception.InnerException == null ? string.Empty : exception.InnerException.Message);
                        mySqlCommand.Parameters.AddWithValue("@Stock_Code", stock_code);
                        mySqlCommand.Parameters.AddWithValue("@Barcode", barcode);
                        mySqlCommand.Parameters.AddWithValue("@Thrown_Time", DateTime.Now);
                        _ = mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                MessageBox.Show(Form.ActiveForm, "Logları yazarken bir hatayla karşılaşıldı!. Hata : " + exc.Message, "HATA!", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
