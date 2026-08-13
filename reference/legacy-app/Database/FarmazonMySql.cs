using MySql.Data.MySqlClient;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BuyBoxApp.Database
{
    public static class FarmazonMySql
    {
        private static string mysqlConnectionString;

        static bool settingsImported;
        public static void IOUFarmazonListings(JToken listingToken, bool getActiveListings)
        {
            try
            {
                if (!settingsImported) ImportSettings();
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = mysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = System.Data.CommandType.Text;
                        mySqlCommand.CommandText = "INSERT INTO farmazon_listings " +
                            "(id, price, buyingPrice, stock, maxCount, description, expiration, isFeatured, isBestPrice, active, " +
                            "product_id, product_name, product_vat, product_listingMinPrice, product_barcode1, product_barcode2, " +
                            "product_barcode3, product_barcode4, LastUpdateDate) VALUES (@id, @price, @buyingPrice, @stock, @maxCount, @description, " +
                            "@expiration, @isFeatured, @isBestPrice,@active, @product_id, @product_name, @product_vat, " +
                            "@product_listingMinPrice, @product_barcode1, @product_barcode2, @product_barcode3, @product_barcode4,@LastUpdateDate) " +
                            "ON DUPLICATE KEY UPDATE price = @price, buyingPrice= @buyingPrice, stock= @stock, maxCount= @maxCount, " +
                            "description= @description, expiration= @expiration, isFeatured= @isFeatured, isBestPrice= @isBestPrice, " +
                            "active= @active, product_id= @product_id, product_name= @product_name, product_vat= @product_vat, " +
                            "product_listingMinPrice= @product_listingMinPrice, product_barcode1= @product_barcode1, " +
                            "product_barcode2= @product_barcode2, product_barcode3= @product_barcode3, product_barcode4= @product_barcode4,LastUpdateDate=@LastUpdateDate";
                        mySqlCommand.Parameters.AddWithValue("@id", Convert.ToInt32(listingToken["id"]));
                        mySqlCommand.Parameters.AddWithValue("@price", Convert.ToDouble(listingToken["price"]));
                        var buyingPrice = listingToken["buyingPrice"] == null ? Convert.ToDouble(listingToken["buyingPrice"]) : 0;
                        mySqlCommand.Parameters.AddWithValue("@buyingPrice", buyingPrice);
                        mySqlCommand.Parameters.AddWithValue("@stock", Convert.ToInt32(listingToken["stock"]));
                        mySqlCommand.Parameters.AddWithValue("@maxCount", Convert.ToInt32(listingToken["maxCount"]));
                        mySqlCommand.Parameters.AddWithValue("@description", listingToken["description"].ToString());
                        var temp = listingToken["expiration"];
                        if (!listingToken["expiration"].HasValues)
                        {
                            mySqlCommand.Parameters.AddWithValue("@expiration", DBNull.Value);
                        }
                        else
                        {
                            mySqlCommand.Parameters.AddWithValue("@expiration", DateTime.Parse(listingToken["expiration"].ToString(), null, System.Globalization.DateTimeStyles.RoundtripKind));
                        }
                        mySqlCommand.Parameters.AddWithValue("@isFeatured", Convert.ToBoolean(listingToken["isFeatured"]));
                        mySqlCommand.Parameters.AddWithValue("@isBestPrice", Convert.ToBoolean(listingToken["isBestPrice"]));
                        mySqlCommand.Parameters.AddWithValue("@active", getActiveListings);
                        mySqlCommand.Parameters.AddWithValue("@product_id", Convert.ToInt32(listingToken["product"]["id"]));
                        mySqlCommand.Parameters.AddWithValue("@product_name", listingToken["product"]["name"].ToString());
                        mySqlCommand.Parameters.AddWithValue("@product_vat", Convert.ToInt16(listingToken["product"]["var"]));
                        mySqlCommand.Parameters.AddWithValue("@product_listingMinPrice", Convert.ToDouble(listingToken["product"]["listingMinPrice"]));
                        if (!listingToken["product"]["barcodes"].HasValues)
                        {

                            mySqlCommand.Parameters.AddWithValue("@product_barcode1", DBNull.Value);
                            mySqlCommand.Parameters.AddWithValue("@product_barcode2", DBNull.Value);
                            mySqlCommand.Parameters.AddWithValue("@product_barcode3", DBNull.Value);
                            mySqlCommand.Parameters.AddWithValue("@product_barcode4", DBNull.Value);
                        }
                        else
                        {
                            var barcode = listingToken["product"]["barcodes"].First;
                            mySqlCommand.Parameters.AddWithValue("@product_barcode1", barcode["barcode"].ToString());
                            barcode = barcode.Next;
                            if (barcode == null)
                            {
                                mySqlCommand.Parameters.AddWithValue("@product_barcode2", DBNull.Value);
                                mySqlCommand.Parameters.AddWithValue("@product_barcode3", DBNull.Value);
                                mySqlCommand.Parameters.AddWithValue("@product_barcode4", DBNull.Value);
                            }
                            else
                            {
                                mySqlCommand.Parameters.AddWithValue("@product_barcode2", barcode["barcode"].ToString());
                                barcode = barcode.Next;
                                if (barcode == null)
                                {
                                    mySqlCommand.Parameters.AddWithValue("@product_barcode3", DBNull.Value);
                                    mySqlCommand.Parameters.AddWithValue("@product_barcode4", DBNull.Value);
                                }
                                else
                                {
                                    mySqlCommand.Parameters.AddWithValue("@product_barcode3", barcode["barcode"].ToString());
                                    barcode = barcode.Next;
                                    if (barcode == null)
                                    {
                                        mySqlCommand.Parameters.AddWithValue("@product_barcode4", DBNull.Value);
                                    }
                                    else
                                    {
                                        mySqlCommand.Parameters.AddWithValue("@product_barcode4", barcode["barcode"].ToString());
                                    }
                                }
                            }
                        }
                        mySqlCommand.Parameters.AddWithValue("@LastUpdateDate", DateTime.Now);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("FarmazonMySql", "IOUFarmazonListings", exc, stock_code: listingToken["product"]["barcodes"][0]["barcode"].ToString());
            }
        }
        internal static void ClearFzListings()
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = mysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "TRUNCATE TABLE farmazon_listings";
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("FarmazonMySql", "ClearFzListings", exc);
            }
        }
        private static void ImportSettings()
        {
            mysqlConnectionString = Properties.Settings.Default.MysqlConnectionString;
            settingsImported = true;
        }
    }
}
