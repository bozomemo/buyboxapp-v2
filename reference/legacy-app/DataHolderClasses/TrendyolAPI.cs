using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BuyBoxApp
{
    public class TrendyolAPI
    {
        public class FilterProducts
        {
            public class ProductCardInfo
            {
                public int page { get; set; }
                public int size { get; set; }
                public int totalElements { get; set; }
                public int totalPages { get; set; }
                public IList<Content> content { get; set; }
                public class Attribute
                {
                    public int attributeId { get; set; }
                    public string attributeName { get; set; }
                    public string attributeValue { get; set; }
                    public int attributeValueId { get; set; }
                }
                public class Image
                {
                    public string url { get; set; }
                }
                public class Content
                {
                    public bool approved { get; set; }
                    public IList<Attribute> attributes { get; set; }
                    public string barcode { get; set; }
                    public string batchRequestId { get; set; }
                    public string brand { get; set; }
                    public int brandId { get; set; }
                    public long campaignEndDate { get; set; }
                    public double campaignMaxPrice { get; set; }
                    public long campaignStartDate { get; set; }
                    public string categoryName { get; set; }
                    public long createDateTime { get; set; }
                    public string description { get; set; }
                    public int dimensionalWeight { get; set; }
                    public bool hasActiveCampaign { get; set; }
                    public string id { get; set; }
                    public IList<Image> images { get; set; }
                    public long lastPriceChangeDate { get; set; }
                    public long lastStockChangeDate { get; set; }
                    public long lastUpdateDate { get; set; }
                    public double listPrice { get; set; }
                    public bool locked { get; set; }
                    public bool onSale { get; set; }
                    public int pimCategoryId { get; set; }
                    public string platformListingId { get; set; }
                    public int productCode { get; set; }
                    public int productContentId { get; set; }
                    public string productMainId { get; set; }
                    public int quantity { get; set; }
                    public double salePrice { get; set; }
                    public int shipmentAddressId { get; set; }
                    public string stockCode { get; set; }
                    public string stockId { get; set; }
                    public string stockUnitType { get; set; }
                    public int supplierId { get; set; }
                    public string title { get; set; }
                    public int vatRate { get; set; }
                    public int version { get; set; }
                    public double categoryMaxPrice { get; set; }
                    public double categoryMinPrice { get; set; }
                    public bool rejected { get; set; }
                    public IList<object> rejectReasonDetails { get; set; }
                    public bool blacklisted { get; set; }
                }
            }
        }
        public class UpdatePriceAndInventory
        {
            public class Item
            {
                public string barcode { get; set; }
                public int quantity { get; set; }
                public double salePrice { get; set; }
                public double listPrice { get; set; }
            }
            public class PriceAndInventory
            {
                public IList<Item> items { get; set; }
            }
        }
        public class BatchRequestResult
        {
            public class Image
            {
                public string url { get; set; }
            }

            public class VariantAttribute
            {
                public string attributeName { get; set; }
                public string attributeValue { get; set; }
            }

            public class Product
            {
                public string brand { get; set; }
                public string barcode { get; set; }
                public string title { get; set; }
                public string description { get; set; }
                public string categoryName { get; set; }
                public double listPrice { get; set; }
                public double salePrice { get; set; }
                public string currencyType { get; set; }
                public int vatRate { get; set; }
                public string cargoCompany { get; set; }
                public int quantity { get; set; }
                public string stockCode { get; set; }
                public IList<Image> images { get; set; }
                public string productMainId { get; set; }
                public string gender { get; set; }
                public int dimensionalWeight { get; set; }
                public IList<object> attributes { get; set; }
                public IList<VariantAttribute> variantAttributes { get; set; }
            }

            public class RequestItem
            {
                public Product product { get; set; }
            }

            public class Item
            {
                public RequestItem requestItem { get; set; }
                public string status { get; set; }
                public IList<object> failureReasons { get; set; }
            }

            public class RequestResult
            {
                public string batchRequestId { get; set; }
                public IList<Item> items { get; set; }
                public string status { get; set; }
                public long creationDate { get; set; }
                public long lastModification { get; set; }
                public string sourceType { get; set; }
                public int itemCount { get; set; }
            }
        }
        public class BatchRequestId
        {
            public class RequestId
            {
                public string batchRequestId { get; set; }
            }
        }
    }
}
