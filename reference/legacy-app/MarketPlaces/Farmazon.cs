using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

namespace BuyBoxApp.MarketPlaces
{
    public static class Farmazon
    {
        private static string token;
        private static DateTime tokenExpireDate;
        private static bool settingsImported;
        private static string username;
        private static string password;
        private static string clientName;
        private static string clientSecretKey;
        private static byte orderState;
        private static ushort pageSize;
        private static readonly byte LISTING_STATE_ACTIVE = 1;
        private static readonly byte LISTING_STATE_PASSIVE = 2;


        public static void GetSoldOrders(int page = 1)
        {
            try
            {
                var url = "https://lab.farmazon.com.tr/api/v1/orders/getsoldorders";
                var parameters = new System.Collections.Specialized.NameValueCollection {
                    {"page", page.ToString()},
                    {"count", pageSize.ToString()},
                    {"orderState",orderState.ToString()}
                };
                using (var webClient = CreateWebClient(parameters))
                {
                    var response_array = webClient.DownloadData(url);
                    var json_text = Encoding.UTF8.GetString(response_array);
                    var json_obj = JObject.Parse(json_text);
                    var result_token = json_obj["result"];
                    if (result_token.HasValues)
                    {
                        foreach (var order in result_token.Children())
                        {
                            foreach (var tempToken in order.Children())
                            {

                            }
                        }
                        GetSoldOrders(page + 1);
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("Farmazon", "GetSoldOrders", exc);
            }
        }
        public static void GetSoldOrder(string orderId)
        {
            try
            {
                var url = "https://lab.farmazon.com.tr/api/v1/orders/getsoldorder";
                var parameters = new System.Collections.Specialized.NameValueCollection {
                    {"orderId", orderId}
                };
                using (var webClient = CreateWebClient(parameters))
                {
                    var response_array = webClient.DownloadData(url);
                    var json_text = Encoding.UTF8.GetString(response_array);
                    var json_obj = JObject.Parse(json_text);
                    var result_token = json_obj["result"];
                    if (result_token.HasValues)
                    {

                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("Farmazon", "GetSoldOrder", exc);
            }
        }
        public static void GetListings(int page = 1, bool getActive = true)
        {
            try
            {
                if (DateTime.Now > tokenExpireDate) GetToken();
                var url = @"https://lab.farmazon.com.tr/api/v1/listings/getlistings";
                var parameters = new System.Collections.Specialized.NameValueCollection {
                    {"page", page.ToString()},
                    {"count", pageSize.ToString()},
                    {"listingState", getActive ? LISTING_STATE_ACTIVE.ToString() : LISTING_STATE_PASSIVE.ToString()}
                };
                using (var webClient = CreateWebClient(parameters))
                {
                    var response_array = webClient.DownloadData(url);
                    var json_text = Encoding.UTF8.GetString(response_array);
                    var json_obj = JObject.Parse(json_text);
                    var result_token = json_obj["result"];
                    if (result_token.HasValues)
                    {
                        foreach (var listing in result_token.Children())
                        {
                            Database.FarmazonMySql.IOUFarmazonListings(listing, getActive);
                        }

                        GetListings(page + 1, getActive);
                    }
                    else
                    {
                        if (getActive)
                        {
                            GetListings(page: 1, false);
                        }
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("Farmazon", "GetListings", exc);
            }
        }
        private static void GetToken()
        {
            try
            {
                if (!settingsImported) ImportSettings();
                string url = "https://lab.farmazon.com.tr/api/v1/account/signin";
                using (var webClient = new WebClient())
                {
                    webClient.Headers[HttpRequestHeader.ContentType] = "application/x-www-form-urlencoded";
                    var parameters = new System.Collections.Specialized.NameValueCollection();
                    parameters.Add("username", username);
                    parameters.Add("password", password);
                    parameters.Add("clientName", clientName);
                    parameters.Add("clientSecretKey", clientSecretKey);
                    var response = webClient.UploadValues(url, "POST", parameters);
                    JObject tokenContents = JObject.Parse(Encoding.UTF8.GetString(response));
                    if (tokenContents["statusMessage"] != null && tokenContents["statusMessage"].ToString() == "OK")
                    {
                        token = tokenContents["result"]["token"].ToString();
                        tokenExpireDate = DateTime.Parse(tokenContents["result"]["tokenExpireDate"].ToString(), null, System.Globalization.DateTimeStyles.RoundtripKind);
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("Farmazon", "GetToken", exc);
            }
        }
        private static WebClient CreateWebClient(System.Collections.Specialized.NameValueCollection nameValueCollection)
        {
            if (!settingsImported) ImportSettings();
            if (DateTime.Now > tokenExpireDate) GetToken();
            var webClient = new WebClient();
            webClient.QueryString = nameValueCollection;
            webClient.Headers.Add("ContentType", "application/json");
            webClient.Headers.Add("Authorization", "Bearer " + token);
            //File.WriteAllText("FarmazonToken.txt", token);
            return webClient;
        }
        private static void ImportSettings()
        {
            try
            {
                //TODO : For now these are hardcoded. Change it to get from database later.
                username = "shh_its_secret";
                password = "shh_its_secret";
                clientName = "shh_its_secret";
                clientSecretKey = "shh_its_secret";
                pageSize = 100;
                orderState = 2;
                settingsImported = true;

            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("Farmazon", "ImportSettings", exc);
            }
        }
    }
}
