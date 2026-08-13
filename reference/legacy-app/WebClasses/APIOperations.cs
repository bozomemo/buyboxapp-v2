using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;

namespace BuyBoxApp
{
    internal static class APIOperations
    {
        static readonly string api = "its_secret";
        static readonly string password = "its_secret";
        static readonly string supplierId = "its_secret";
        public static TrendyolAPI.FilterProducts.ProductCardInfo getProductCard(string barcode)
        {
            try
            {
                string url = string.Format("https://api.trendyol.com/sapigw/suppliers/{0}/products?approved=true&barcode={1}", supplierId, barcode);
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
                byte[] authbytes = Encoding.ASCII.GetBytes(string.Format("{0}:{1}", api, password));
                string base64 = Convert.ToBase64String(authbytes);
                request.Headers.Add("Authorization", "Basic " + base64);
                request.UserAgent = supplierId + " - SelfIntegration";
                request.Method = "GET";
                request.ContentType = "application/json";
                var response = (HttpWebResponse)request.GetResponse();
                var responseString = new StreamReader(response.GetResponseStream()).ReadToEnd();
                TrendyolAPI.FilterProducts.ProductCardInfo trendyolProductCards = JsonConvert.DeserializeObject<TrendyolAPI.FilterProducts.ProductCardInfo>(responseString);
                return trendyolProductCards;
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("APIOperations", "getProductCard", exc, barcode: barcode);
                TrendyolAPI.FilterProducts.ProductCardInfo errorProduct = new TrendyolAPI.FilterProducts.ProductCardInfo
                {
                    content = new List<TrendyolAPI.FilterProducts.ProductCardInfo.Content>()
                };
                var errorContent = new TrendyolAPI.FilterProducts.ProductCardInfo.Content
                {
                    title = "Error"
                };
                errorProduct.content.Add(errorContent);
                return errorProduct;
            }
        }
        public static TrendyolAPI.BatchRequestId.RequestId updatePriceAndInventory(TrendyolAPI.UpdatePriceAndInventory.PriceAndInventory priceAndInventory)
        {
            string url = string.Format("https://api.trendyol.com/sapigw/suppliers/{0}/products/price-and-inventory", supplierId);
            if (priceAndInventory.items.Count > 100)
            {
                return null;
            }
            else
            {
                string json = JsonConvert.SerializeObject(priceAndInventory);
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
                byte[] authbytes = Encoding.ASCII.GetBytes(string.Format("{0}:{1}", api, password));
                string base64 = Convert.ToBase64String(authbytes);
                request.Headers.Add("Authorization", "Basic " + base64);
                request.UserAgent = supplierId + " - SelfIntegration";
                request.Method = "POST";
                request.ContentType = "application/json";
                using (var streamWriter = new StreamWriter(request.GetRequestStream()))
                {
                    streamWriter.Write(json);
                }
                var response = (HttpWebResponse)request.GetResponse();
                using (var streamReader = new StreamReader(response.GetResponseStream()))
                {
                    var responeString = streamReader.ReadToEnd();
                    return JsonConvert.DeserializeObject<TrendyolAPI.BatchRequestId.RequestId>(responeString);
                }
            }
        }
        public static TrendyolAPI.BatchRequestResult.RequestResult getBatchRequestResult(string batchRequestId)
        {
            string url = string.Format("https://api.trendyol.com/sapigw/suppliers/{0}/products/batch-requests/{1}", supplierId, batchRequestId);
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
            byte[] authbytes = Encoding.ASCII.GetBytes(string.Format("{0}:{1}", api, password));
            string base64 = Convert.ToBase64String(authbytes);
            request.Headers.Add("Authorization", "Basic " + base64);
            request.UserAgent = supplierId + " - SelfIntegration";
            request.Method = "GET";
            request.ContentType = "application/json";
            var response = (HttpWebResponse)request.GetResponse();
            var responseString = new StreamReader(response.GetResponseStream()).ReadToEnd();
            var batchRequestResult = JsonConvert.DeserializeObject<TrendyolAPI.BatchRequestResult.RequestResult>(responseString);
            return batchRequestResult;
        }
        public static void Update_Quantity(int updated_quantity, TrendyolAPI.FilterProducts.ProductCardInfo.Content content)
        {
            var temp_update_object = new TrendyolAPI.UpdatePriceAndInventory.PriceAndInventory
            {
                items = new List<TrendyolAPI.UpdatePriceAndInventory.Item>()
            };
            var item = new TrendyolAPI.UpdatePriceAndInventory.Item
            {
                barcode = content.barcode,
                quantity = updated_quantity,
                listPrice = content.listPrice,
                salePrice = content.salePrice,
            };
            temp_update_object.items.Add(item);
            _ = APIOperations.updatePriceAndInventory(temp_update_object);
        }
        public static void Update_price(double updated_price, TrendyolAPI.FilterProducts.ProductCardInfo.Content content)
        {
            var temp_update_object = new TrendyolAPI.UpdatePriceAndInventory.PriceAndInventory
            {
                items = new List<TrendyolAPI.UpdatePriceAndInventory.Item>()
            };
            var item = new TrendyolAPI.UpdatePriceAndInventory.Item
            {
                barcode = content.barcode,
                quantity = content.quantity,
                listPrice = content.listPrice,
                salePrice = updated_price
            };
            temp_update_object.items.Add(item);
            _ = APIOperations.updatePriceAndInventory(temp_update_object);
        }
        public static void Update_list_price(double updated_list_price, TrendyolAPI.FilterProducts.ProductCardInfo.Content content)
        {
            var temp_update_object = new TrendyolAPI.UpdatePriceAndInventory.PriceAndInventory
            {
                items = new List<TrendyolAPI.UpdatePriceAndInventory.Item>()
            };
            var item = new TrendyolAPI.UpdatePriceAndInventory.Item
            {
                barcode = content.barcode,
                quantity = content.quantity,
                listPrice = updated_list_price,
                salePrice = content.salePrice
            };
            temp_update_object.items.Add(item);
            _ = APIOperations.updatePriceAndInventory(temp_update_object);
        }
        private static void CreateCommonLabel(string cargoTrackingNumber)
        {
            try
            {
                var url = $"https://api.trendyol.com/sapigw/suppliers/{cargoTrackingNumber}/common-label/{supplierId}?format=ZPL";
                using (var client = new WebClient())
                {
                    byte[] authbytes = Encoding.ASCII.GetBytes(string.Format("{0}:{1}", api, password));
                    string base64 = Convert.ToBase64String(authbytes);
                    client.Headers.Add("Authorization", "Basic " + base64);
                    client.Headers.Add("User-Agent", supplierId + " - SelfIntegration");
                    var byteArr = Encoding.UTF8.GetBytes("");
                    var response = client.UploadData(url, byteArr);
                    var responseStr = Encoding.UTF8.GetString(response);
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("APIOperations", "CreateCommonLabel", exc);
            }
        }
        public static string GetCommonLabel(string cargoTrackingNumber)
        {
            try
            {
                CreateCommonLabel(cargoTrackingNumber);
                var url = $"https://api.trendyol.com/sapigw/suppliers/{supplierId}/common-label/v2/{cargoTrackingNumber}";
                using (var client = new WebClient())
                {
                    byte[] authbytes = Encoding.ASCII.GetBytes(string.Format("{0}:{1}", api, password));
                    string base64str = Convert.ToBase64String(authbytes);
                    client.Headers.Add("Authorization", "Basic " + base64str);
                    client.Headers.Add("User-Agent", supplierId + " - SelfIntegration");
                    var returnedByteArr = client.DownloadData(url);
                    var returnedStr = Encoding.UTF8.GetString(returnedByteArr);
                    var jsonObj = JObject.Parse(returnedStr);
                }
                return string.Empty;
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("APIOperations", "GetCommonLabel", exc);
                return null;
            }
        }
        public static void Api_Code_Trials()
        {
            try
            {
                GetCommonLabel("7330000447241629");
            }
            catch (Exception exc)
            {
                Console.WriteLine(exc.Message);
            }
        }
    }
}
