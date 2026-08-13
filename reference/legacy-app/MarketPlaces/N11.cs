using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using System.Xml;

namespace BuyBoxApp.MarketPlaces
{
    public static class N11
    {
        private static string appKey;
        private static string appSecret;
        private static int pageSize;
        private static bool settingsImported;
        private static N11ProductService.Authentication auth;
        private static bool authCreated;


        public static void N11Trials()
        {
            GetProductByProductId(507999257);
        }
        private static void GetProductList(int page = 0)
        {
            if (!authCreated) CreateAuth();
            var portService = new N11ProductService.ProductServicePortService();
            var request = new N11ProductService.GetProductListRequest
            {
                auth = auth,
                pagingData = new N11ProductService.RequestPagingData
                {
                    currentPage = page,
                    pageSize = pageSize
                }
            };
            var response = portService.GetProductList(request);
            if (response.result.status == "success")
            {
                if (response.products.Length != 0)
                {
                    foreach (var product in response.products)
                    {
                        // TODO : Fill after doing gittigidiyor
                    }
                }
            }
        }
        private static N11ProductService.Product GetProductByProductId(int id)
        {
            if (!authCreated) CreateAuth();
            var portService = new N11ProductService.ProductServicePortService();
            var request = new N11ProductService.GetProductByProductIdRequest
            {
                auth = auth,
                productId = id
            };
            var response = portService.GetProductByProductId(request);
            if (response.result.status == "success")
            {
                return response.product;
            }
            else
            {
                return null;
            }
        }
        private static void CreateAuth()
        {
            if (!settingsImported) ImportSettings();
            auth = new N11ProductService.Authentication
            {
                appKey = appKey,
                appSecret = appSecret
            };
            authCreated = true;
        }
        private static void ImportSettings()
        {
            // TODO : For now these are hardcoded. Change it afterwards.
            appKey = "REDACTED";
            appSecret = "REDACTED";
            pageSize = 100;

            settingsImported = true;
        }
    }
}
