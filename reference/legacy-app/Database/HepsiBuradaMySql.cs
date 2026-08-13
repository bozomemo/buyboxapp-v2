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
    public static class HepsiBuradaMySql
    {
        public static void UpdateMarketplaceOrdersPendingApproval(DataHolderClasses.Product.MarketplaceOrder marketplaceOrder)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "INSERT INTO marketplaceorderspendingapproval (orderId, orderMarketplaceCode, orderPackageId, orderMarketplace, orderDate, orderStateId," +
                            " orderState, orderReferenceNo, orderGrossPrice, orderTotalDiscount, orderTotalPrice, shipmentCompany, shipmentCargoCode, buyerId, buyerUsername," +
                            " buyerDeliveryName, buyerDeliveryAddress, buyerDeliveryEmail, buyerDeliveryPhone, buyerDeliveryDistrict, buyerDeliveryTown, buyerDeliveryCity," +
                            " buyerInvoiceName, buyerInvoicePhone, buyerInvoiceEmail, buyerInvoiceTaxOrTcNo, buyerInvoiceTaxOffice, buyerInvoiceAddress, buyerInvoiceDistrict," +
                            " buyerInvoiceTown, buyerInvoiceCity, lastUpdateDate) VALUES (@orderId, @orderMarketplaceCode, @orderPackageId," +
                            " @orderMarketplace, @orderDate, @orderStateId, @orderState, @orderReferenceNo, @orderGrossPrice, @orderTotalDiscount, @orderTotalPrice, @shipmentCompany," +
                            " @shipmentCargoCode, @buyerId, @buyerUsername, @buyerDeliveryName, @buyerDeliveryAddress, @buyerDeliveryEmail, @buyerDeliveryPhone, @buyerDeliveryDistrict," +
                            " @buyerDeliveryTown, @buyerDeliveryCity, @buyerInvoiceName, @buyerInvoicePhone, @buyerInvoiceEmail, @buyerInvoiceTaxOrTcNo, @buyerInvoiceTaxOffice," +
                            " @buyerInvoiceAddress, @buyerInvoiceDistrict, @buyerInvoiceTown, @buyerInvoiceCity, @lastUpdateDate)";
                        mySqlCommand.Parameters.AddWithValue("@orderId", marketplaceOrder.orderId);
                        mySqlCommand.Parameters.AddWithValue("@orderMarketplaceCode", marketplaceOrder.orderMarketplaceCode);
                        mySqlCommand.Parameters.AddWithValue("@orderPackageId", marketplaceOrder.orderPackageId);
                        mySqlCommand.Parameters.AddWithValue("@orderMarketplace", marketplaceOrder.orderMarketplace);
                        mySqlCommand.Parameters.AddWithValue("@orderDate", marketplaceOrder.orderDate);
                        mySqlCommand.Parameters.AddWithValue("@orderStateId", marketplaceOrder.orderStateId);
                        mySqlCommand.Parameters.AddWithValue("@orderState", marketplaceOrder.orderState);
                        mySqlCommand.Parameters.AddWithValue("@orderReferenceNo", marketplaceOrder.orderReferenceNo);
                        mySqlCommand.Parameters.AddWithValue("@orderGrossPrice", Math.Round(marketplaceOrder.orderGrossPrice, 2));
                        mySqlCommand.Parameters.AddWithValue("@orderTotalDiscount", Math.Round(marketplaceOrder.orderTotalDiscount, 2));
                        mySqlCommand.Parameters.AddWithValue("@orderTotalPrice", Math.Round(marketplaceOrder.orderTotalPrice, 2));
                        mySqlCommand.Parameters.AddWithValue("@shipmentCompany", marketplaceOrder.shipmentCompany);
                        mySqlCommand.Parameters.AddWithValue("@shipmentCargoCode", marketplaceOrder.shipmentCargoCode);
                        mySqlCommand.Parameters.AddWithValue("@buyerId", marketplaceOrder.buyerId);
                        mySqlCommand.Parameters.AddWithValue("@buyerUsername", marketplaceOrder.buyerUsername);
                        mySqlCommand.Parameters.AddWithValue("@buyerDeliveryName", marketplaceOrder.buyerDeliveryName);
                        mySqlCommand.Parameters.AddWithValue("@buyerDeliveryAddress", marketplaceOrder.buyerDeliveryAddress);
                        mySqlCommand.Parameters.AddWithValue("@buyerDeliveryEmail", marketplaceOrder.buyerDeliveryEmail);
                        mySqlCommand.Parameters.AddWithValue("@buyerDeliveryPhone", marketplaceOrder.buyerDeliveryPhone);
                        mySqlCommand.Parameters.AddWithValue("@buyerDeliveryDistrict", marketplaceOrder.buyerDeliveryDistrict);
                        mySqlCommand.Parameters.AddWithValue("@buyerDeliveryTown", marketplaceOrder.buyerDeliveryTown);
                        mySqlCommand.Parameters.AddWithValue("@buyerDeliveryCity", marketplaceOrder.buyerDeliveryCity);
                        mySqlCommand.Parameters.AddWithValue("@buyerInvoiceName", marketplaceOrder.buyerInvoiceName);
                        mySqlCommand.Parameters.AddWithValue("@buyerInvoicePhone", marketplaceOrder.buyerInvoicePhone);
                        mySqlCommand.Parameters.AddWithValue("@buyerInvoiceEmail", marketplaceOrder.buyerInvoiceEmail);
                        mySqlCommand.Parameters.AddWithValue("@buyerInvoiceTaxOrTcNo", marketplaceOrder.buyerInvoiceTaxOrTcNo);
                        mySqlCommand.Parameters.AddWithValue("@buyerInvoiceTaxOffice", marketplaceOrder.buyerInvoiceTaxOffice);
                        mySqlCommand.Parameters.AddWithValue("@buyerInvoiceAddress", marketplaceOrder.buyerInvoiceAddress);
                        mySqlCommand.Parameters.AddWithValue("@buyerInvoiceDistrict", marketplaceOrder.buyerInvoiceDistrict);
                        mySqlCommand.Parameters.AddWithValue("@buyerInvoiceTown", marketplaceOrder.buyerInvoiceTown);
                        mySqlCommand.Parameters.AddWithValue("@buyerInvoiceCity", marketplaceOrder.buyerInvoiceCity);
                        mySqlCommand.Parameters.AddWithValue("@lastUpdateDate", DateTime.Now);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "UpdateMarketplaceOrdersPendingApproval", exc);
            }
        }
        public static void ClearHbMarketplaceOrdersPendingApproval()
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "DELETE FROM marketplaceorderspendingapproval WHERE orderMarketplaceCode = @orderMarketplaceCode";
                        mySqlCommand.Parameters.AddWithValue("@orderMarketplaceCode", "HB");
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "DeleteMarketplaceOrdersPendingApproval", exc);
            }
        }
        public static void UpdateMarketplaceOrdersProductsPendingApproval(DataHolderClasses.Product.MarketplaceOrderProduct marketplaceOrderProduct)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "INSERT INTO marketplaceorderproductspendingapproval (orderId, productBarcode, productStockCode, orderMarketplaceCode," +
                            " productName, quantity, unitPrice, totalPrice, unitDiscountPrice, totalDiscountPrice, vat, commissionRate, currentProductUnitPrice," +
                            " currentPriceWithoutExpenses, profit, lastUpdateDate) VALUES (@orderId, @productBarcode, @productStockCode, @orderMarketplaceCode, @productName," +
                            " @quantity, @unitPrice, @totalPrice, @unitDiscountPrice, @totalDiscountPrice, @vat, @commissionRate," +
                            " ROUND(sfGetUnitPrice(@productStockCode,sfGetPriceMultiplier(@productStockCode)) * @quantity , 2)," +
                            " ROUND(sfGetHbPriceWithoutExpenditure(@totalPrice / sfGetHbBasketRatio(@productBarcode) , @commissionRate * 1.18, sfGetHbBasketRatio(@productBarcode), sfGetHbStoreDebtAmount(@productBarcode)),2)," +
                            " ROUND(sfGetHbPriceWithoutExpenditure(@totalPrice / sfGetHbBasketRatio(@productBarcode) , @commissionRate * 1.18, sfGetHbBasketRatio(@productBarcode), sfGetHbStoreDebtAmount(@productBarcode)) - sfGetUnitPrice(@productStockCode,sfGetPriceMultiplier(@productStockCode)) * @quantity,2)," +
                            " @lastUpdateDate)";
                        mySqlCommand.Parameters.AddWithValue("@orderId", marketplaceOrderProduct.orderId);
                        mySqlCommand.Parameters.AddWithValue("@productBarcode", marketplaceOrderProduct.productBarcode);
                        mySqlCommand.Parameters.AddWithValue("@productStockCode", marketplaceOrderProduct.productStockCode);
                        mySqlCommand.Parameters.AddWithValue("@orderMarketplaceCode", marketplaceOrderProduct.orderMarketplaceCode);
                        mySqlCommand.Parameters.AddWithValue("@productName", marketplaceOrderProduct.productName);
                        mySqlCommand.Parameters.AddWithValue("@quantity", marketplaceOrderProduct.quantity);
                        mySqlCommand.Parameters.AddWithValue("@unitPrice", Math.Round(marketplaceOrderProduct.unitPrice, 2));
                        mySqlCommand.Parameters.AddWithValue("@totalPrice", Math.Round(marketplaceOrderProduct.totalPrice, 2));
                        mySqlCommand.Parameters.AddWithValue("@unitDiscountPrice", Math.Round(marketplaceOrderProduct.unitDiscountPrice, 2));
                        mySqlCommand.Parameters.AddWithValue("@totalDiscountPrice", Math.Round(marketplaceOrderProduct.totalDiscountPrice, 2));
                        mySqlCommand.Parameters.AddWithValue("@vat", Math.Round(marketplaceOrderProduct.vat, 2));
                        mySqlCommand.Parameters.AddWithValue("@commissionRate", Math.Round(marketplaceOrderProduct.commissionRate, 2));
                        mySqlCommand.Parameters.AddWithValue("@lastUpdateDate", DateTime.Now);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "UpdateMarketplaceOrdersProductsPendingApproval", exc);
            }
        }
        public static void ClearHbMarketplaceOrderProductsPendingApproval()
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "DELETE FROM marketplaceorderproductspendingapproval WHERE orderMarketplaceCode = @orderMarketplaceCode";
                        mySqlCommand.Parameters.AddWithValue("@orderMarketplaceCode", "HB");
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "DeleteMarketplaceOrderProductsPendingApproval", exc);
            }
        }
        public static void UpdateListing(JToken listingProduct)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "INSERT INTO hblistings (HepsiburadaSku, MerchantSku, Price, AvailableStock, DispatchTime, CargoCompany1, CargoCompany2," +
                            " CargoCompany3, ShippingAddressLabel, ClaimAddressLabel, MaximumPurchasableQuantity, MinimumPurchasableQuantity, IsSalable, DeactivationReasons," +
                            " IsSuspended, IsLocked, LockReasons, IsFrozen, CommissionRate, IsFulfilledByHB, HasPricing, IncreasePrice, DecreasePrice, LastUpdateDate) VALUES (@HepsiburadaSku, @MerchantSku, @Price, @AvailableStock, " +
                            "@DispatchTime, @CargoCompany1, @CargoCompany2, @CargoCompany3, @ShippingAddressLabel, @ClaimAddressLabel, @MaximumPurchasableQuantity, " +
                            "@MinimumPurchasableQuantity, @IsSalable, @DeactivationReasons, @IsSuspended, @IsLocked, @LockReasons, @IsFrozen, @CommissionRate, " +
                            "@IsFulfilledByHB, @HasPricing, @IncreasePrice, @DecreasePrice, @LastUpdateDate) ON DUPLICATE KEY UPDATE MerchantSku = @MerchantSku, Price = @Price, AvailableStock = @AvailableStock, DispatchTime = @DispatchTime, " +
                            "CargoCompany1 = @CargoCompany1, CargoCompany2 = @CargoCompany2, CargoCompany3 = @CargoCompany3, ShippingAddressLabel = @ShippingAddressLabel," +
                            " ClaimAddressLabel = @ClaimAddressLabel, MaximumPurchasableQuantity = @MaximumPurchasableQuantity, MinimumPurchasableQuantity = @MinimumPurchasableQuantity," +
                            " IsSalable = @IsSalable, DeactivationReasons = @DeactivationReasons, IsSuspended = @IsSuspended, IsLocked = @IsLocked, LockReasons = @LockReasons," +
                            " IsFrozen = @IsFrozen, CommissionRate = @CommissionRate, IsFulfilledByHB = @IsFulfilledByHB, HasPricing = @HasPricing, LastUpdateDate = @LastUpdateDate";
                        mySqlCommand.Parameters.AddWithValue("@HepsiburadaSku", listingProduct["hepsiburadaSku"].ToString());
                        mySqlCommand.Parameters.AddWithValue("@MerchantSku", listingProduct["merchantSku"].ToString());
                        mySqlCommand.Parameters.AddWithValue("@Price", Convert.ToDouble(listingProduct["price"]));
                        mySqlCommand.Parameters.AddWithValue("@AvailableStock", Convert.ToInt16(listingProduct["availableStock"]));
                        mySqlCommand.Parameters.AddWithValue("@DispatchTime", Convert.ToInt16(listingProduct["dispatchTime"]));
                        mySqlCommand.Parameters.AddWithValue("@CargoCompany1", listingProduct["cargoCompany1"].ToString());
                        mySqlCommand.Parameters.AddWithValue("@CargoCompany2", listingProduct["cargoCompany2"].ToString());
                        mySqlCommand.Parameters.AddWithValue("@CargoCompany3", listingProduct["cargoCompany3"].ToString());
                        mySqlCommand.Parameters.AddWithValue("@ShippingAddressLabel", listingProduct["shippingAddressLabel"].ToString());
                        mySqlCommand.Parameters.AddWithValue("@ClaimAddressLabel", listingProduct["claimAddressLabel"].ToString());
                        mySqlCommand.Parameters.AddWithValue("@MaximumPurchasableQuantity", Convert.ToByte(listingProduct["maximumPurchasableQuantity"]));
                        mySqlCommand.Parameters.AddWithValue("@MinimumPurchasableQuantity", Convert.ToByte(listingProduct["minimumPurchasableQuantity"]));
                        mySqlCommand.Parameters.AddWithValue("@IsSalable", Convert.ToBoolean(listingProduct["isSalable"]));
                        var deactivationReasons = string.Empty;
                        foreach (var deactivationReasonToken in listingProduct["deactivationReasons"])
                        {
                            deactivationReasons += deactivationReasonToken.ToString() + "|";
                        }
                        if (deactivationReasons.Length > 0) deactivationReasons = deactivationReasons.Remove(deactivationReasons.Length - 1);
                        mySqlCommand.Parameters.AddWithValue("@DeactivationReasons", deactivationReasons);
                        mySqlCommand.Parameters.AddWithValue("@IsSuspended", Convert.ToBoolean(listingProduct["isSuspended"]));
                        mySqlCommand.Parameters.AddWithValue("@IsLocked", Convert.ToBoolean(listingProduct["isLocked"]));
                        var lockReasons = string.Empty;
                        foreach (var lockReasonToken in listingProduct["lockReasons"])
                        {
                            lockReasons += lockReasonToken.ToString() + "|";
                        }
                        if (lockReasons.Length > 0) lockReasons = lockReasons.Remove(lockReasons.Length - 1);
                        mySqlCommand.Parameters.AddWithValue("@LockReasons", lockReasons);
                        mySqlCommand.Parameters.AddWithValue("@IsFrozen", Convert.ToBoolean(listingProduct["isFrozen"]));
                        mySqlCommand.Parameters.AddWithValue("@CommissionRate", Convert.ToDouble(listingProduct["commissionRate"]));
                        mySqlCommand.Parameters.AddWithValue("@IsFulfilledByHB", Convert.ToBoolean(listingProduct["isFulfilledByHB"]));
                        mySqlCommand.Parameters.AddWithValue("@HasPricing", listingProduct["pricings"].First != null);
                        mySqlCommand.Parameters.AddWithValue("@IncreasePrice", true);
                        mySqlCommand.Parameters.AddWithValue("@DecreasePrice", true);
                        mySqlCommand.Parameters.AddWithValue("@LastUpdateDate", DateTime.Now);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "UpdateListing", exc, stock_code: listingProduct["merchantSku"].ToString());
            }

        }
        public static void UpdateListingPricing(JToken listingProductPricing)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "INSERT INTO hblistingpricings (HepsiburadaSku, FinalPrice, StartDate, EndDate, StoreDebtAmount, HepsiBuradaDebtAmount) " +
                            "VALUES (@HepsiburadaSku, @FinalPrice, @StartDate, @EndDate, @StoreDebtAmount, @HepsiBuradaDebtAmount) ON DUPLICATE KEY UPDATE " +
                            "FinalPrice = @FinalPrice, StartDate = @StartDate, EndDate = @EndDate, StoreDebtAmount = @StoreDebtAmount, HepsiBuradaDebtAmount = @HepsiBuradaDebtAmount";
                        mySqlCommand.Parameters.AddWithValue("@HepsiburadaSku", listingProductPricing.Parent.Parent.Parent["hepsiburadaSku"].ToString());
                        mySqlCommand.Parameters.AddWithValue("@FinalPrice", Convert.ToDouble(listingProductPricing["finalPrice"]));
                        mySqlCommand.Parameters.AddWithValue("@StartDate", DateTime.Parse(listingProductPricing["startDate"].ToString()));
                        mySqlCommand.Parameters.AddWithValue("@EndDate", DateTime.Parse(listingProductPricing["endDate"].ToString()));
                        var storeDebtAmount = 100;
                        var hepsiBuradaDebtAmount = 0;
                        if (listingProductPricing["debtors"].First["debtor"].ToString() == "Mağaza")
                        {
                            storeDebtAmount = Convert.ToInt32(listingProductPricing["debtors"].First["amount"]);
                            hepsiBuradaDebtAmount = 100 - storeDebtAmount;
                        }
                        else
                        {
                            hepsiBuradaDebtAmount = Convert.ToInt32(listingProductPricing["debtors"].First["amount"]);
                            storeDebtAmount = 100 - hepsiBuradaDebtAmount;
                        }

                        mySqlCommand.Parameters.AddWithValue("@StoreDebtAmount", storeDebtAmount);
                        mySqlCommand.Parameters.AddWithValue("@HepsiBuradaDebtAmount", hepsiBuradaDebtAmount);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "UpdateListingPricing", exc, stock_code: listingProductPricing.Parent["merchantSku"].ToString());
            }
        }
        public static void ClearListingPricing()
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "DELETE FROM hblistingpricings";
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "ClearListingPricing", exc);
            }
        }
        public static void ClearBuyboxOrders()
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "DELETE FROM hbbuyboxorders";
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "ClearBuyboxOrders", exc);
            }
        }
        public static void UpdateBuyboxOrders(JToken variantToken)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "INSERT INTO hbbuyboxorders (Sku, BuyboxOrders, LastUpdateDate)	" +
                            "VALUES (@Sku, @BuyboxOrders, @LastUpdateDate) ON DUPLICATE KEY UPDATE " +
                            "BuyboxOrders = @BuyboxOrders, LastUpdateDate = @LastUpdateDate";
                        mySqlCommand.Parameters.AddWithValue("@Sku", variantToken["sku"].ToString());
                        mySqlCommand.Parameters.AddWithValue("@BuyboxOrders", variantToken.ToString());
                        mySqlCommand.Parameters.AddWithValue("@LastUpdateDate", DateTime.Now);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "UpdateBuyboxOrders", exc);
            }
        }
        public static void InsertHbPriceChanges(AutomateWorks.HBAutoBB.HbPriceChange hbPriceChange)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "INSERT INTO hbpricechanges (HepsiburadaSku, CurrentUnitPrice, BeforeChangeSellingPrice, AfterChangeSellingPrice," +
                            " BasketRatio, CommissionRate, BeforeChangeBuyboxPrice, BeforeChangeSecondSellerPrice, BeforeChangeInBuybox, LastChangeTime) " +
                            "VALUES (@HepsiburadaSku, @CurrentUnitPrice, @BeforeChangeSellingPrice, @AfterChangeSellingPrice, @BasketRatio, " +
                            "@CommissionRate, @BeforeChangeBuyboxPrice, @BeforeChangeSecondSellerPrice, @BeforeChangeInBuybox, @LastChangeTime)";
                        mySqlCommand.Parameters.AddWithValue("@HepsiburadaSku", hbPriceChange.hbSku);
                        mySqlCommand.Parameters.AddWithValue("@CurrentUnitPrice", hbPriceChange.currentUnitPrice);
                        mySqlCommand.Parameters.AddWithValue("@BeforeChangeSellingPrice", hbPriceChange.beforeChangeSellingPrice);
                        mySqlCommand.Parameters.AddWithValue("@AfterChangeSellingPrice", hbPriceChange.afterChangeSellingPrice);
                        mySqlCommand.Parameters.AddWithValue("@BasketRatio", hbPriceChange.basketRatio);
                        mySqlCommand.Parameters.AddWithValue("@CommissionRate", hbPriceChange.commissionRate);
                        mySqlCommand.Parameters.AddWithValue("@BeforeChangeBuyboxPrice", hbPriceChange.beforeChangeBuxboxPrice);
                        mySqlCommand.Parameters.AddWithValue("@BeforeChangeSecondSellerPrice", hbPriceChange.beforeChangeSecondSellerPrice);
                        mySqlCommand.Parameters.AddWithValue("@BeforeChangeInBuybox", hbPriceChange.beforeChangeInBuybox);
                        mySqlCommand.Parameters.AddWithValue("@LastChangeTime", DateTime.Now);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "InsertHbPriceChanges", exc);
            }
        }
        public static DataRow GetHBListing(string hepsiburadaSku)
        {
            try
            {
                using (var mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    var commandText = "SELECT * from vw_hblistings where HepsiburadaSku = @HepsiburadaSku";
                    using (var mySqlDataAdapter = new MySqlDataAdapter(commandText, mySqlConnection))
                    {
                        var datatable = new DataTable();
                        mySqlDataAdapter.SelectCommand.Parameters.AddWithValue("@HepsiburadaSku", hepsiburadaSku);
                        mySqlDataAdapter.Fill(datatable);
                        return datatable.Rows[0];
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "GetHBListing", exc, barcode: hepsiburadaSku);
                return null;
            }
        }
        public static JToken GetHBBuyboxOrder(string hepsiburadaSku)
        {
            try
            {
                using (var mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (var mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "SELECT buyboxorders FROM hbbuyboxorders WHERE Sku = @Sku";
                        mySqlCommand.Parameters.AddWithValue("@Sku", hepsiburadaSku);
                        object hbBuyboxOrder = mySqlCommand.ExecuteScalar();
                        if (hbBuyboxOrder != null)
                        {
                            return JObject.Parse(hbBuyboxOrder.ToString());
                        }
                        else
                        {
                            return null;
                        }
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "GetHBBuyboxOrder", exc, barcode: hepsiburadaSku);
                return null;
            }
        }
        public static void FillHbProductCardTable()
        {
            try
            {
                Applications.HbProductCardTable.Clear();
                using (MySqlConnection mySqlConnection = new MySqlConnection(Properties.Settings.Default.MysqlConnectionString))
                {
                    mySqlConnection.Open();
                    using (MySqlDataAdapter mySqlDataAdapter = new MySqlDataAdapter("select * from vw_hblistings", mySqlConnection))
                    {
                        mySqlDataAdapter.Fill(Applications.HbProductCardTable);
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "FillHbProductCardTable", exc);
            }
        }
        public static DataTable Gethblistings()
        {
            var dataTable = new DataTable();
            try
            {
                Applications.HbProductCardTable.Clear();
                using (MySqlConnection mySqlConnection = new MySqlConnection(Properties.Settings.Default.MysqlConnectionString))
                {
                    mySqlConnection.Open();
                    using (MySqlDataAdapter mySqlDataAdapter = new MySqlDataAdapter("select * from vw_hblistings", mySqlConnection))
                    {
                        mySqlDataAdapter.Fill(dataTable);
                    }
                }
                return dataTable;
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "FillHbProductCardTable", exc);
                return dataTable;
            }
        }
        public static DataRow GetHBListingPricing(string hepsiburadaSku)
        {
            try
            {
                using (var mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (var mySqlDataAdapter = new MySqlDataAdapter())
                    {
                        var datatable = new DataTable();
                        mySqlDataAdapter.SelectCommand.Connection = mySqlConnection;
                        mySqlDataAdapter.SelectCommand.CommandType = CommandType.Text;
                        mySqlDataAdapter.SelectCommand.CommandText = "select * from hblistingpricings where HepsiburadaSku = @HepsiburadaSku";
                        mySqlDataAdapter.Fill(datatable);
                        return datatable.Rows[0];
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "GetHBListingPricing", exc, barcode: hepsiburadaSku);
                return null;
            }
        }
        internal static AutomateWorks.HBAutoBB.HbPriceChange GetHbPriceChange(string hbSku)
        {
            try
            {
                using (var mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (var mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "SELECT * FROM hbpricechanges WHERE HepsiburadaSku = @hbSku ORDER BY LastChangeTime DESC LIMIT 1;";
                        mySqlCommand.Parameters.AddWithValue("@hbSku", hbSku);
                        using (var mySqlDataReader = mySqlCommand.ExecuteReader())
                        {
                            if (mySqlDataReader.Read())
                            {
                                return new AutomateWorks.HBAutoBB.HbPriceChange
                                {
                                    hbSku = mySqlDataReader["HepsiburadaSku"].ToString(),
                                    currentUnitPrice = Convert.ToDouble(mySqlDataReader["CurrentUnitPrice"]),
                                    beforeChangeSellingPrice = Convert.ToDouble(mySqlDataReader["BeforeChangeSellingPrice"]),
                                    afterChangeSellingPrice = Convert.ToDouble(mySqlDataReader["AfterChangeSellingPrice"]),
                                    basketRatio = Convert.ToDouble(mySqlDataReader["BasketRatio"]),
                                    commissionRate = Convert.ToDouble(mySqlDataReader["CommissionRate"]),
                                    beforeChangeBuxboxPrice = Convert.ToDouble(mySqlDataReader["BeforeChangeBuyboxPrice"]),
                                    beforeChangeSecondSellerPrice = Convert.ToDouble(mySqlDataReader["BeforeChangeSecondSellerPrice"]),
                                    beforeChangeInBuybox = Convert.ToBoolean(mySqlDataReader["BeforeChangeInBuybox"])
                                };
                            }
                            else
                            {
                                return new AutomateWorks.HBAutoBB.HbPriceChange();
                            }
                        }
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "GetHbPriceChange", exc);
                return new AutomateWorks.HBAutoBB.HbPriceChange();
            }
        }
        internal static double GetHbChangedPrice(string hepsiburadaSku, double priceToAdd)
        {
            try
            {
                using (var mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (var mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "SELECT sfGetHbChangedPrice(@hepsiburadaSku, @priceToAdd);";
                        mySqlCommand.Parameters.AddWithValue("@hepsiburadaSku", hepsiburadaSku);
                        mySqlCommand.Parameters.AddWithValue("@priceToAdd", priceToAdd);
                        var changedPrice = mySqlCommand.ExecuteScalar();
                        if (changedPrice != null)
                        {
                            return Math.Round(Convert.ToDouble(changedPrice), 2);
                        }
                        else
                        {
                            return -1;
                        }
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "GetLowestSellablePrice", exc);
                return -1;
            }
        }
        internal static void EditAutoBB(string stock_code, bool changed_value)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "update stock_table set HbAutomatedBuybox = @changed_value where Stock_Code = @stock_Code";
                        mySqlCommand.Parameters.AddWithValue("@stock_Code", stock_code);
                        mySqlCommand.Parameters.AddWithValue("@changed_value", changed_value);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "editAutoBB", exc, stock_code: stock_code);
            }
        }
        internal static void EditSpecialPriceMultiplier(string stock_code, double changed_value)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "update stock_table set HbSpecialPriceMultiplier = @changed_value where Stock_Code = @stock_Code";
                        mySqlCommand.Parameters.AddWithValue("@stock_Code", stock_code);
                        mySqlCommand.Parameters.AddWithValue("@changed_value", changed_value);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "EditSpecialPriceMultiplier", exc, stock_code: stock_code);
            }
        }
        internal static void EditIncreasePrice(string hbSku, bool changedValue)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "UPDATE hblistings SET IncreasePrice = @IncreasePrice WHERE HepsiburadaSku = @HepsiburadaSku";
                        mySqlCommand.Parameters.AddWithValue("@HepsiburadaSku", hbSku);
                        mySqlCommand.Parameters.AddWithValue("@IncreasePrice", changedValue);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "EditIncreasePrice", exc, barcode: hbSku);
            }
        }
        internal static void EditDecreasePrice(string hbSku, bool changedValue)
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlCommand mySqlCommand = new MySqlCommand())
                    {
                        mySqlCommand.Connection = mySqlConnection;
                        mySqlCommand.CommandType = CommandType.Text;
                        mySqlCommand.CommandText = "UPDATE hblistings SET DecreasePrice = @DecreasePrice WHERE HepsiburadaSku = @HepsiburadaSku";
                        mySqlCommand.Parameters.AddWithValue("@HepsiburadaSku", hbSku);
                        mySqlCommand.Parameters.AddWithValue("@DecreasePrice", changedValue);
                        mySqlCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "EditDecreasePrice", exc, barcode: hbSku);
            }
        }
        internal static DataTable GetAutoBbListings()
        {
            try
            {
                using (MySqlConnection mySqlConnection = new MySqlConnection())
                {
                    mySqlConnection.ConnectionString = Properties.Settings.Default.MysqlConnectionString;
                    mySqlConnection.Open();
                    using (MySqlDataAdapter mySqlDataAdapter = new MySqlDataAdapter(new MySqlCommand("SELECT * FROM buyboxapp.vw_hblistings where vw_hblistings.IsSalable = 1 and AutoBBActive = 1;", mySqlConnection)))
                    {
                        var tempTable = new DataTable();
                        mySqlDataAdapter.Fill(tempTable);
                        return tempTable;
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBuradaMySql", "GetAutoBbListings", exc);
                return null;
            }
        }
    }
}
