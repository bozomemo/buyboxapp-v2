using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;

namespace BuyBoxApp.MarketPlaces
{
    public static class HepsiBurada
    {
        private static string storeName;
        private static string password;
        private static string merchantId;
        private static bool settingsImported;
        private static short pagingLimit;
        private static string hbMarketplaceCode;
        private static string hbMarketplaceName;
        private static byte pendingApprovalStateId;
        private static string pendingApprovalState;



        public static void Trial_Codes()
        {

        }
        public static void GetListings(List<string> hbSkuList)
        {
            try
            {
                if (!settingsImported) ImportSettings();
                var url = $"https://listing-external.hepsiburada.com/listings/merchantid/{merchantId}";
                var nameValueCollection = new System.Collections.Specialized.NameValueCollection
                {
                    { "hbskulist", string.Join(",",hbSkuList)}
                };
                using (var client = CreateWebClient(nameValueCollection))
                {
                    var response = client.DownloadData(url);
                    var responseStr = Encoding.UTF8.GetString(response);
                    var listingsToken = JObject.Parse(responseStr);
                    var listingTokens = listingsToken["listings"];
                    var buyboxOrderList = new List<string>();
                    foreach (var listingToken in listingTokens.Children())
                    {
                        var isSalable = Convert.ToBoolean(listingToken["isSalable"]);
                        if (Convert.ToBoolean(listingToken["isSalable"])) buyboxOrderList.Add(listingToken["hepsiburadaSku"].ToString());
                        var pricingToken = listingToken["pricings"].First != null ? listingToken["pricings"].First : null;
                        Database.HepsiBuradaMySql.UpdateListing(listingToken);
                        if (pricingToken != null) Database.HepsiBuradaMySql.UpdateListingPricing(pricingToken);
                    }
                    GetBuyboxOrders(buyboxOrderList);
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBurada", "GetListings", exc);
            }
        }
        public static void GetListings(int offset = 0)
        {
            try
            {
                if (!settingsImported) ImportSettings();
                var url = $"https://listing-external.hepsiburada.com/listings/merchantid/{merchantId}";
                var nameValueCollection = new System.Collections.Specialized.NameValueCollection
                {
                    { "offset", offset.ToString() },
                    { "limit", pagingLimit.ToString() }
                };
                using (var client = CreateWebClient(nameValueCollection))
                {
                    var response = client.DownloadData(url);
                    var responseStr = Encoding.UTF8.GetString(response);
                    var listingsToken = JObject.Parse(responseStr);
                    var totalCount = Convert.ToInt32(listingsToken["totalCount"]);
                    var skuList = new List<string>();
                    foreach (var listingToken in listingsToken["listings"].Children())
                    {
                        JToken listingPricingToken = null;
                        Database.HepsiBuradaMySql.UpdateListing(listingToken);
                        if (listingToken["pricings"].First != null)
                        {
                            listingPricingToken = listingToken["pricings"].First;
                            Database.HepsiBuradaMySql.UpdateListingPricing(listingPricingToken);
                        }
                        if (Convert.ToBoolean(listingToken["isSalable"]))
                        {
                            skuList.Add(listingToken["hepsiburadaSku"].ToString());
                        }
                        if (skuList.Count == 10)
                        {
                            if (skuList.Count != 0) GetBuyboxOrders(skuList);
                            skuList.Clear();
                        }
                    }
                    if (offset + pagingLimit < totalCount)
                    {
                        if (skuList.Count != 0) GetBuyboxOrders(skuList);
                        skuList.Clear();
                        GetListings(offset + pagingLimit);
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBurada", "GetListings", exc);
            }
        }
        public static void GetOrdersPendingApproval()
        {
            try
            {
                if (!settingsImported) ImportSettings();
                var beginDate = DateTime.Now.AddDays(-1);
                var endDate = DateTime.Now;
                var url = $"https://oms-external.hepsiburada.com/orders/merchantid/{merchantId}";
                var nameValueCollection = new System.Collections.Specialized.NameValueCollection();
                using (var client = CreateWebClient(nameValueCollection))
                {
                    var response = client.DownloadData(url);
                    var responseStr = Encoding.UTF8.GetString(response);
                    var ordersToken = JObject.Parse(responseStr);
                    var totalCount = Convert.ToInt32(ordersToken["totalCount"]);
                    Database.HepsiBuradaMySql.ClearHbMarketplaceOrderProductsPendingApproval();
                    Database.HepsiBuradaMySql.ClearHbMarketplaceOrdersPendingApproval();
                    foreach (var orderToken in ordersToken["items"].Children())
                    {
                        var orderPendingApproval = CreateHbOrder(orderToken);
                        var orderProductPendingApproval = CreateHbOrderProduct(orderToken);
                        Database.HepsiBuradaMySql.UpdateMarketplaceOrdersPendingApproval(orderPendingApproval);
                        Database.HepsiBuradaMySql.UpdateMarketplaceOrdersProductsPendingApproval(orderProductPendingApproval);
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBurada", "GetOrders", exc);
            }
        }
        public static JObject CheckInvUpdateStatus(string invUplId)
        {
            try
            {
                if (!settingsImported) ImportSettings();
                var url = $"https://listing-external.hepsiburada.com/listings/merchantid/{merchantId}/inventory-uploads/id/{invUplId}";
                using (var client = CreateWebClient(new System.Collections.Specialized.NameValueCollection()))
                {
                    var response = client.DownloadData(url);
                    var responseStr = Encoding.UTF8.GetString(response);
                    var responseJson = JObject.Parse(responseStr);
                    return responseJson;
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBurada", "CheckInvUpdateStatus", exc);
                return null;
            }
        }
        public static string UpdateListings(List<JToken> listingTokens)
        {
            try
            {
                if (!settingsImported) ImportSettings();
                var url = $"https://listing-external.hepsiburada.com/listings/merchantid/{merchantId}/inventory-uploads";
                var xmlStr = CreateListingXmlBody(listingTokens);
                var byteArr = Encoding.UTF8.GetBytes(xmlStr);
                using (var client = CreateWebClient(new System.Collections.Specialized.NameValueCollection()))
                {
                    var response = client.UploadData(url, byteArr);
                    var responseStr = Encoding.UTF8.GetString(response);
                    var responseJson = JObject.Parse(responseStr);
                    var dnemeJson = CheckInvUpdateStatus(responseJson["id"].ToString());
                    return responseJson["id"].ToString();
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBurada", "UpdateListings", exc);
                return null;
            }
        }
        public static string UpdateListings(List<DataHolderClasses.Product.HBProduct> priceUpdateList)
        {
            try
            {
                if (!settingsImported) ImportSettings();
                var url = $"https://listing-external.hepsiburada.com/listings/merchantid/{merchantId}/inventory-uploads";
                var xmlStr = CreateListingXmlBody(priceUpdateList);
                var byteArr = Encoding.UTF8.GetBytes(xmlStr);
                using (var client = CreateWebClient(new System.Collections.Specialized.NameValueCollection()))
                {
                    var response = client.UploadData(url, byteArr);
                    var responseStr = Encoding.UTF8.GetString(response);
                    var responseJson = JObject.Parse(responseStr);
                    return responseJson["id"].ToString();
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBurada", "UpdateListings", exc);
                return null;
            }
        }
        private static string CreateListingXmlBody(List<JToken> listingTokens)
        {
            var XmlBody = string.Empty;
            foreach (var listingToken in listingTokens)
            {
                XmlBody += $"<listing>" +
                                $"<HepsiburadaSku>{listingToken["hepsiburadaSku"]}</HepsiburadaSku>" +
                                $"<MerchantSku>{listingToken["merchantSku"]}</MerchantSku>" +
                                $"<ProductName>{""}</ProductName>" +
                                $"<Price>{listingToken["price"]}</Price>" +
                                $"<AvailableStock>{listingToken["availableStock"]}</AvailableStock>" +
                                $"<DispatchTime>{listingToken["dispatchTime"]}</DispatchTime>" +
                                $"<MaximumPurchasableQuantity>{listingToken["maximumPurchasableQuantity"]}</MaximumPurchasableQuantity>" +
                                $"<CargoCompany1>{listingToken["cargoCompany1"]}</CargoCompany1>" +
                                $"<CargoCompany2>{listingToken["cargoCompany2"]}</CargoCompany2>" +
                                $"<CargoCompany3>{listingToken["cargoCompany3"]}</CargoCompany3>" +
                            $"</listing>";
            }
            var xmlStr = $"<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
                        $"<listings xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\">"
                        + XmlBody +
                        $"</listings>";
            return xmlStr;
        }
        private static string CreateListingXmlBody(List<DataHolderClasses.Product.HBProduct> hbProducts)
        {
            var XmlBody = string.Empty;
            foreach (var hbProduct in hbProducts)
            {
                XmlBody += $"<listing>" +
                                $"<HepsiburadaSku>{hbProduct.HepsiburadaSku}</HepsiburadaSku>" +
                                $"<MerchantSku>{hbProduct.MerchantSku}</MerchantSku>" +
                                $"<ProductName>{string.Empty}</ProductName>" +
                                $"<Price>{hbProduct.Price}</Price>" +
                                $"<AvailableStock>{hbProduct.AvailableStock}</AvailableStock>" +
                                $"<DispatchTime>{hbProduct.DispatchTime}</DispatchTime>" +
                                $"<MaximumPurchasableQuantity>{hbProduct.MaximumPurchasableQuantity}</MaximumPurchasableQuantity>" +
                                $"<CargoCompany1>{hbProduct.CargoCompany1}</CargoCompany1>" +
                                $"<CargoCompany2>{hbProduct.CargoCompany2}</CargoCompany2>" +
                                $"<CargoCompany3>{hbProduct.CargoCompany3}</CargoCompany3>" +
                            $"</listing>";
            }
            var xmlStr = $"<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
                        $"<listings xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\">"
                        + XmlBody +
                        $"</listings>";
            return xmlStr;
        }
        private static DataHolderClasses.Product.MarketplaceOrderProduct CreateHbOrderProduct(JToken orderToken)
        {
            try
            {
                return new DataHolderClasses.Product.MarketplaceOrderProduct
                {
                    orderId = Convert.ToUInt64(orderToken["orderNumber"]),
                    productBarcode = orderToken["sku"].ToString(),
                    productStockCode = orderToken["merchantSKU"].ToString(),
                    orderMarketplaceCode = hbMarketplaceCode,
                    productName = orderToken["name"].ToString(),
                    quantity = Convert.ToInt16(orderToken["quantity"]),
                    unitPrice = Convert.ToDouble(orderToken["unitPrice"]["amount"]),
                    totalPrice = Convert.ToDouble(orderToken["totalPrice"]["amount"]),
                    totalDiscountPrice = Convert.ToDouble(orderToken["hbDiscount"]["totalPrice"]["amount"]),
                    unitDiscountPrice = Convert.ToDouble(orderToken["hbDiscount"]["unitPrice"]["amount"]),
                    commissionRate = Convert.ToDouble(orderToken["commissionRate"]),
                    vat = Convert.ToDouble(orderToken["vatRate"]),
                    debtorDifferenceAmount = Convert.ToDouble(orderToken["deptorDifferenceAmount"])
                };

            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBurada", "UpdateListings", exc);
                return new DataHolderClasses.Product.MarketplaceOrderProduct();
            }
        }
        private static DataHolderClasses.Product.MarketplaceOrder CreateHbOrder(JToken orderToken)
        {
            try
            {
                return new DataHolderClasses.Product.MarketplaceOrder
                {
                    orderId = Convert.ToUInt64(orderToken["orderNumber"]),
                    orderMarketplaceCode = hbMarketplaceCode,
                    orderPackageId = 0,
                    orderMarketplace = hbMarketplaceName,
                    orderDate = DateTime.Parse(orderToken["orderDate"].ToString(), null, System.Globalization.DateTimeStyles.RoundtripKind),
                    orderStateId = pendingApprovalStateId,
                    orderState = pendingApprovalState,
                    orderReferenceNo = string.Empty,
                    orderGrossPrice = Convert.ToDouble(orderToken["totalPrice"]["amount"]) + Convert.ToDouble(orderToken["deptorDifferenceAmount"]),
                    orderTotalDiscount = Convert.ToDouble(orderToken["deptorDifferenceAmount"]),
                    orderTotalPrice = Convert.ToDouble(orderToken["totalPrice"]["amount"]),
                    shipmentCompany = orderToken["cargoCompanyModel"]["name"].ToString(),
                    shipmentCargoCode = string.Empty,
                    buyerId = orderToken["customerId"].ToString(),
                    buyerUsername = orderToken["customerName"].ToString(),
                    buyerDeliveryName = orderToken["shippingAddress"]["name"].ToString(),
                    buyerDeliveryAddress = orderToken["shippingAddress"]["address"].ToString(),
                    buyerDeliveryEmail = orderToken["shippingAddress"]["email"].ToString(),
                    buyerDeliveryPhone = orderToken["shippingAddress"]["phoneNumber"].ToString(),
                    buyerDeliveryDistrict = orderToken["shippingAddress"]["district"].ToString(),
                    buyerDeliveryTown = orderToken["shippingAddress"]["town"].ToString(),
                    buyerDeliveryCity = orderToken["shippingAddress"]["city"].ToString(),
                    buyerInvoiceName = orderToken["invoice"]["address"]["name"].ToString(),
                    buyerInvoicePhone = orderToken["invoice"]["address"]["phoneNumber"].ToString(),
                    buyerInvoiceEmail = orderToken["invoice"]["address"]["email"].ToString(),
                    buyerInvoiceTaxOrTcNo = orderToken["invoice"]["taxNumber"].ToString(),
                    buyerInvoiceTaxOffice = orderToken["invoice"]["taxOffice"].ToString(),
                    buyerInvoiceAddress = orderToken["invoice"]["address"]["address"].ToString(),
                    buyerInvoiceDistrict = orderToken["invoice"]["address"]["district"].ToString(),
                    buyerInvoiceTown = orderToken["invoice"]["address"]["town"].ToString(),
                    buyerInvoiceCity = orderToken["invoice"]["address"]["city"].ToString()
                };
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBurada", "CreateHbOrder", exc);
                return new DataHolderClasses.Product.MarketplaceOrder();
            }
        }
        private static string GetExcelSavePath()
        {
            try
            {
                var saveFileDialog1 = new System.Windows.Forms.SaveFileDialog();

                saveFileDialog1.Filter = "Excel files (*.xlsx)|*.xlsx";
                saveFileDialog1.FilterIndex = 2;
                saveFileDialog1.RestoreDirectory = true;

                if (saveFileDialog1.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                {
                    return saveFileDialog1.FileName;
                }
                else
                {
                    return string.Empty;
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBurada", "GetExcelSavePath", exc);
                return string.Empty;
            }
        }
        private static void GetBuyboxOrders(List<string> hepsiburadaSkus)
        {
            try
            {
                if (!settingsImported) ImportSettings();
                if (hepsiburadaSkus.Count != 0)
                {
                    var url = $"https://listing-external.hepsiburada.com/buybox-orders/merchantid/{merchantId}";
                    var skuList = string.Join(",", hepsiburadaSkus);
                    var nameValueCollection = new System.Collections.Specialized.NameValueCollection
                {
                    { "skuList", skuList }
                };
                    using (var client = CreateWebClient(nameValueCollection))
                    {
                        var response = client.DownloadData(url);
                        var responseStr = Encoding.UTF8.GetString(response);
                        var variants = JObject.Parse(responseStr);
                        foreach (var variantToken in variants.First.First.Children())
                        {
                            Database.HepsiBuradaMySql.UpdateBuyboxOrders(variantToken);
                        }
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HepsiBurada", "GetBuyboxOrders", exc);
            }
        }
        private static WebClient CreateWebClient(System.Collections.Specialized.NameValueCollection nameValueCollection)
        {
            if (!settingsImported) ImportSettings();
            var client = new WebClient();
            var byteArr = Encoding.UTF8.GetBytes($"{storeName}:{password}");
            var base64Str = Convert.ToBase64String(byteArr);
            client.Headers.Add("Authorization", "Basic " + base64Str);
            client.Headers.Add("Accept", "application/json");
            client.QueryString = nameValueCollection;
            return client;
        }
        private static void ImportSettings()
        {
            // TODO : Make these unhardcoded.
            storeName = "REDACTED";
            password = "REDACTED";
            merchantId = "REDACTED";
            pagingLimit = 100;
            hbMarketplaceCode = "HB";
            hbMarketplaceName = "Hepsiburada";
            pendingApprovalState = "Onay Bekleniyor.";
            pendingApprovalStateId = 1;

            settingsImported = true;
        }
    }
}
