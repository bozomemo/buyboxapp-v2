using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BuyBoxApp
{
    public class TYProductCard
    {
        public int unitCount { get; set; }
        public int productContentId { get; set; }
        public double priceDifference { get; set; }
        public double priceDifferenceSecond { get; set; }
        public int ratingCount { get; set; }
        public int commentCount { get; set; }
        public string productLink { get; set; }
        public string brand { get; set; }
        public string category { get; set; }
        public double original_unit_price { get; set; }
        public double unitPrice { get; set; }
        public string barcode { get; set; }
        public double commission { get; set; }
        public string modelCode { get; set; }
        public string productName { get; set; }
        public string sellerStockCode { get; set; }
        public double list_price { get; set; }
        public double trendyolSellingPrice { get; set; }
        public double lowestSellablePrice { get; set; }
        public HAPParser.Seller buyBoxSeller { get; set; }
        public List<HAPParser.Seller> other_Sellers { get; set; }
        public HAPParser.Seller second_Seller { get; set; }
        public HAPParser.Seller third_Seller { get; set; }
        public HAPParser.Seller fourth_Seller { get; set; }
        public HAPParser.Seller fifth_Seller { get; set; }
        public int sellingStock { get; set; }
        public int unitTotalStock { get; set; }
        public bool onSale { get; set; }
        public bool inBuyBox { get; set; }
        public bool underLowestSellablePrice { get; set; }
        public bool stock_Out { get; set; }
        public bool mainProductCard { get; set; }
        public bool blackListed { get; set; }
        public bool rejected { get; set; }
        public bool locked { get; set; }
        public bool increase_price { get; set; }
        public bool decrease_price { get; set; }
        public bool errorOccurred { get; set; }
        public DateTime last_Update_Date { get; set; }
        public int fav_Count { get; set; }
        public double average_Price { get; set; }
        public string product_json_text { get; set; }
        public TYProductCard() { }
    }
}
