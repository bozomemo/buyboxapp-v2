using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Xml;

namespace BuyBoxApp.MarketPlaces
{
    public static class GittiGidiyor
    {
        private static string roleName;
        private static string rolePassword;
        private static string apiKey;
        private static string secretKey;
        private static bool settingsImported;
        private static int rowCount;

        private const string ACTIVE_SALES = "A";
        private const string READY_TO_LIST = "L";
        private const string SOLD = "S";
        private const string UNSOLD = "U";



        public static void GGTrials()
        {
            var UpdateCategoryThread = new System.Threading.Thread(new System.Threading.ThreadStart(UpdateDBCategories));
            UpdateCategoryThread.Start();
        }
        private static void UpdateDBCategories()
        {
            foreach (XmlNode categoryNode in GetParentCategories().SelectSingleNode("//categories").ChildNodes)
            {
                WriteCategoryToDB(categoryNode);
            }
        }
        private static void WriteCategoryToDB(XmlNode categoryNode, string parentCategoryCode = "0")
        {
            var categoryCode = categoryNode.SelectSingleNode("categoryCode").InnerText;
            var isDeepest = categoryNode.Attributes["deepest"].Value == "true";
            SQLFunctions.AddGGCategory(categoryNode, parentCategoryCode);
            var specNodes = categoryNode.SelectSingleNode("specs");
            if (specNodes != null)
            {
                foreach (XmlNode specNode in specNodes.ChildNodes)
                {
                    SQLFunctions.AddGGCategorySpec(specNode, categoryCode);
                }
            }
            if (!isDeepest)
            {
                var subCategories = GetSubCategories(categoryCode).SelectSingleNode("//categories");
                if (subCategories != null)
                {
                    foreach (XmlNode subCategoryNode in subCategories.ChildNodes)
                    {
                        WriteCategoryToDB(subCategoryNode, categoryCode);
                    }
                }
            }
        }
        private static XmlDocument GetSubCategories(string categoryCode)
        {
            try
            {
                var xmlStr = "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:cat=\"http://category.anonymous.ws.listingapi.gg.com\">" +
                    "<soapenv:Header/>" +
                    "<soapenv:Body>" +
                        "<cat:getSubCategories>" +
                            "<categoryCode>" + categoryCode + "</categoryCode>" +
                            "<withSpecs>true</withSpecs>" +
                            "<withDeepest>true</withDeepest>" +
                            "<withCatalog>true</withCatalog>" +
                            "<lang>en</lang>" +
                        "</cat:getSubCategories>" +
                    "</soapenv:Body>" +
                    "</soapenv:Envelope>";
                var response = GetResponse("http://dev.gittigidiyor.com:8080/listingapi/ws/CategoryService", xmlStr);
                var responseXml = new XmlDocument();
                responseXml.LoadXml(response);
                return responseXml;
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("GittiGidiyor", "GetSubCategories", exc);
                return null;
            }
        }
        private static XmlDocument GetParentCategories()
        {
            try
            {
                if (!settingsImported) ImportSettings();
                var xmlStr = "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:cat=\"http://category.anonymous.ws.listingapi.gg.com\">" +
                    "<soapenv:Header/>" +
                    "<soapenv:Body>" +
                        "<cat:getParentCategories>" +
                            "<withSpecs>true</withSpecs>" +
                            "<withDeepest>true</withDeepest>" +
                            "<withCatalog>true</withCatalog>" +
                            "<lang>en</lang>" +
                        "</cat:getParentCategories>" +
                    "</soapenv:Body></soapenv:Envelope>";
                var response = GetResponse("http://dev.gittigidiyor.com:8080/listingapi/ws/CategoryService", xmlStr);
                var responseXml = new XmlDocument();
                responseXml.LoadXml(response);
                return responseXml;
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("GittiGidiyor", "GetParentCategories", exc);
                return null;
            }

        }
        private static void InsertAndActivateProduct(DataHolderClasses.Product.GGProduct ggProduct)
        {
            var time = DateTimeOffset.Now.ToUnixTimeMilliseconds();
            var xmlStr = "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:prod=\"https://product.individual.ws.listingapi.gg.com\">" +
                "<soapenv:Header/>" +
                "<soapenv:Body>" +
                    "<prod:insertAndActivateProduct>" +
                        "<apiKey></apiKey>" +
                        "<sign>" + CreateSignature(time) + "</sign>" +
                        "<time>" + time.ToString() + "</time>" +
                        "<itemId>" + ggProduct.StockCode + "</itemId>" +
                        "<product>" +
                            "<categoryCode>" + ggProduct.CategoryCode + "</categoryCode>" +
                            "<storeCategoryId></storeCategoryId>" +
                            "<!--Optional:-->" +
                            "<title>" + ggProduct.Title + "</title>" +
                            "<!--Optional:-->" +
                            "< subtitle>?</subtitle>" +
                            "<!--Optional:-->" +
                            "<specs>" +
                                "<!--Zero or more repetitions:-->" +
                                "<spec name=\"?\" value=\"?\" type=\"?\" required=\"?\"/>" +
                            "</specs>" +
                            "<!--Optional:-->" +
                            "<photos>" +
                                "<!--Zero or more repetitions:-->" +
                                "<photo photoId=\"?\">" +
                                "<!--Optional:-->" +
                                "<url>?</url>" +
                                "<!--Optional:-->" +
                                "<base64>?</base64>" +
                                "</photo>" +
                            "</photos>" +
                            "<!--Optional:-->" +
                            "<pageTemplate>?</pageTemplate>" +
                            "<!--Optional:-->" +
                            "<description>?</description>" +
                            "<!--Optional:-->" +
                            "<startDate>?</startDate>" +
                            "<!--Optional:-->" +
                            "<catalogId>?</catalogId>" +
                            "<!--Optional:-->" +
                            "<newCatalogId>?</newCatalogId>" +
                            "<!--Optional:-->" +
                            "<catalogDetail>?</catalogDetail>" +
                            "<!--Optional:-->" +
                            "<catalogFilter>?</catalogFilter>" +
                            "<!--Optional:-->" +
                            "<format>?</format>" +
                            "<!--Optional:-->" +
                            "<startPrice>?</startPrice>" +
                            "<!--Optional:-->" +
                            "<buyNowPrice>?</buyNowPrice>" +
                            "<!--Optional:-->" +
                            "<netEarning>?</netEarning>" +
                            "<!--Optional:-->" +
                            "<listingDays>?</listingDays>" +
                            "<!--Optional:-->" +
                            "<productCount>?</productCount>" +
                            "<!--Optional:-->" +
                            "<cargoDetail>" +
                                "<!--Optional:-->" +
                                "<city>?</city>" +
                                "<!--Optional:-->" +
                                "<cargoCompanies>" +
                                    "<!--Zero or more repetitions:-->" +
                                    "<cargoCompany>?</cargoCompany>" +
                                "</cargoCompanies>" +
                                "<!--Optional:-->" +
                                "<shippingPayment>?</shippingPayment>" +
                                "<!--Optional:-->" +
                                "<cargoDescription>?</cargoDescription>" +
                                "<!--Optional:-->" +
                                "<shippingWhere>?</shippingWhere>" +
                                "<!--Optional:-->" +
                                "<shippingFeePaymentType>?</shippingFeePaymentType>" +
                                "<!--Optional:-->" +
                                "<cargoCompanyDetails>" +
                                    "<!--Zero or more repetitions:-->" +
                                    "<cargoCompanyDetail>" +
                                        "<!--Optional:-->" +
                                        "<name>?</name>" +
                                        "<!--Optional:-->" +
                                        "<value>?</value>" +
                                        "<!--Optional:-->" +
                                        "<cityPrice>?</cityPrice>" +
                                        "<!--Optional:-->" +
                                        "<countryPrice>?</countryPrice>" +
                                    "</cargoCompanyDetail>" +
                                "</cargoCompanyDetails>" +
                                "<!--Optional:-->" +
                                "<shippingTime>" +
                                "<!--Optional:-->" +
                                "<days>?</days>" +
                                "<!--Optional:-->" +
                                "<beforeTime>?</beforeTime>" +
                                "</shippingTime>" +
                                "<!--Optional:-->" +
                                "<productPackageSize>" +
                                    "<!--Optional:-->" +
                                    "<width>?</width>" +
                                    "<!--Optional:-->" +
                                    "<height>?</height>" +
                                    "<!--Optional:-->" +
                                    "<depth>?</depth>" +
                                    "<!--Optional:-->" +
                                    "<weight>?</weight>" +
                                    "<!--Optional:-->" +
                                    "<desi>?</desi>" +
                                "</productPackageSize>" +
                            "</cargoDetail>" +
                            "<!--Optional:-->" +
                            "<affiliateOption>?</affiliateOption>" +
                            "<!--Optional:-->" +
                            "<boldOption>?</boldOption>" +
                            "<!--Optional:-->" +
                            "<catalogOption>?</catalogOption>" +
                            "<!--Optional:-->" +
                            "<vitrineOption>?</vitrineOption>" +
                            "<!--Optional:-->" +
                            "<variantGroups>" +
                                "<!--Zero or more repetitions:-->" +
                                "<variantGroup nameId=\"?\" valueId=\"?\" alias=\"?\">" +
                                    "<!--Optional:-->" +
                                    "<variants>" +
                                        "<!--Zero or more repetitions:-->" +
                                        "<variant variantId=\"?\" operation=\"?\">" +
                                            "<!--Optional:-->" +
                                            "<variantSpecs>" +
                                                "<!--Zero or more repetitions:-->" +
                                                "<variantSpec nameId=\"?\" name=\"?\" valueId=\"?\" value=\"?\" orderNumber=\"?\" specDataOrderNumber=\"?\"/>" +
                                            "</variantSpecs>" +
                                            "<!--Optional:-->" +
                                            "<quantity>?</quantity>" +
                                            "<!--Optional:-->" +
                                            "<stockCode>?</stockCode>" +
                                            "<!--Optional:-->" +
                                            "<soldCount>?</soldCount>" +
                                            "<!--Optional:-->" +
                                            "<newCatalogId>?</newCatalogId>" +
                                        "</variant>" +
                                    "</variants>" +
                                    "<!--Optional:-->" +
                                    "<photos>" +
                                        "<!--Zero or more repetitions:-->" +
                                        "<photo photoId=\"?\">" +
                                            "<!--Optional:-->" +
                                            "<url>?</url>" +
                                            "<!--Optional:-->" +
                                            "<base64>?</base64>" +
                                        "</photo>" +
                                    "</photos>" +
                                "</variantGroup>" +
                            "</variantGroups>" +
                            "<!--Optional:-->" +
                            "<auctionProfilePercentage>?</auctionProfilePercentage>" +
                            "<!--Optional:-->" +
                            "<marketPrice>?</marketPrice>" +
                            "<!--Optional:-->" +
                            "<globalTradeItemNo>?</globalTradeItemNo>" +
                            "<!--Optional:-->" +
                            "<manufacturerPartNo>?</manufacturerPartNo>" +
                            "<!--Optional:-->" +
                            "<sameDayDeliveryTypes>" +
                                "<!--Zero or more repetitions:-->" +
                                "<sameDayDeliveryType>" +
                                    "<!--Optional:-->" +
                                    "<lastReceivingTime>?</lastReceivingTime>" +
                                    "<!--Optional:-->" +
                                    "<shippingFirmId>?</shippingFirmId>" +
                                    "<!--Optional:-->" +
                                    "<deliveryOption>?</deliveryOption>" +
                                "</sameDayDeliveryType>" +
                            "</sameDayDeliveryTypes>" +
                        "</product>" +
                        "<forceToSpecEntry>?</forceToSpecEntry>" +
                        "<nextDateOption>?</nextDateOption>" +
                        "<lang>?</lang>" +
                    "</prod:insertAndActivateProduct>" +
                "</soapenv:Body>" +
            "</soapenv:Envelope>";
        }
        private static void GetProducts(int startOffset = 0, string status = GittiGidiyor.ACTIVE_SALES)
        {
            try
            {
                var time = DateTimeOffset.Now.ToUnixTimeMilliseconds();
                if (!settingsImported) ImportSettings();
                var xmlStr = string.Format(@"<soapenv:Envelope xmlns:soapenv=""http://schemas.xmlsoap.org/soap/envelope/"" xmlns:prod=""https://product.individual.ws.listingapi.gg.com"">
                    <soapenv:Header/>
                    <soapenv:Body>
                        <prod:getProducts>
                            <apiKey>{0}</apiKey>
                            <sign>{1}</sign>
                            <time>{2}</time>
                            <startOffSet>{3}</startOffSet>
                            <rowCount>{4}</rowCount>
                            <status>{5}</status>
                            <withData>{6}</withData>
                            <lang>{7}</lang>
                        </prod:getProducts>
                    </soapenv:Body>
                </soapenv:Envelope>", apiKey, CreateSignature(time), time.ToString(), startOffset, rowCount, status, "true", "en");
                var response = GetResponse("https://dev.gittigidiyor.com:8443/listingapi/ws/IndividualProductService", xmlStr);
                var responseXml = new XmlDocument();
                responseXml.LoadXml(response);
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("GittiGidiyor", "GetProducts", exc);
            }
        }
        private static XmlDocument GetProduct(string productId)
        {
            try
            {
                if (!settingsImported) ImportSettings();
                var time = DateTimeOffset.Now.ToUnixTimeMilliseconds();
                var xmlStr = string.Format(@"<soapenv:Envelope xmlns:soapenv=""http://schemas.xmlsoap.org/soap/envelope/"" xmlns:prod=""https://product.individual.ws.listingapi.gg.com"">
                    <soapenv:Header/>
                    <soapenv:Body>
                        <prod:getProduct>
                            <apiKey>{0}</apiKey>
                            <sign>{1}</sign>
                            <time>{2}</time>
                            <productId>{3}</productId>
                            <itemId>{4}</itemId>
                            <lang>en</lang>
                        </prod:getProduct>
                    </soapenv:Body>
                </soapenv:Envelope>", apiKey, CreateSignature(time), time.ToString(), productId, "");
                var response = GetResponse("https://dev.gittigidiyor.com:8443/listingapi/ws/IndividualProductService", xmlStr);
                var responseXml = new XmlDocument();
                responseXml.LoadXml(response);
                var productNode = responseXml.FirstChild.LastChild.FirstChild.FirstChild.LastChild.ChildNodes[2].ChildNodes;
                foreach (XmlNode nodeName in productNode)
                {
                    Console.WriteLine(nodeName.Name);
                }
                return responseXml;
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("GittiGidiyor", "GetProduct", exc);
                return null;
            }
        }
        private static string GetResponse(string url, string xmlStr)
        {
            try
            {
                var responseXmlStr = string.Empty;
                var byteArr = Encoding.UTF8.GetBytes(roleName + ":" + rolePassword);
                var base64Str = Convert.ToBase64String(byteArr);
                using (var client = new WebClient())
                {
                    var uri = new Uri(url);
                    var xmlByteArr = Encoding.UTF8.GetBytes(xmlStr);
                    client.Headers.Add("Authorization", "Basic " + base64Str);
                    var response = client.UploadData(uri, xmlByteArr);
                    responseXmlStr = Encoding.UTF8.GetString(response);
                }
                return responseXmlStr;
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("GittiGidiyor", "GetResponse", exc);
                return null;
            }
        }
        private static string CreateSignature(long time)
        {
            using (System.Security.Cryptography.MD5 md5 = System.Security.Cryptography.MD5.Create())
            {
                byte[] inputBytes = Encoding.ASCII.GetBytes(apiKey + secretKey + time.ToString());
                byte[] hashBytes = md5.ComputeHash(inputBytes);

                // Convert the byte array to hexadecimal string
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < hashBytes.Length; i++)
                {
                    sb.Append(hashBytes[i].ToString("X2"));
                }
                return sb.ToString();
            }
        }
        private static void ImportSettings()
        {
            // TODO : Hardcoded for now.
            apiKey = "REDACTED";
            secretKey = "REDACTED";
            roleName = "REDACTED";
            rolePassword = "REDACTED";
            rowCount = 100;

            settingsImported = true;
        }
    }
}
