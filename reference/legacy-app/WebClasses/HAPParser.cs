using HtmlAgilityPack;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BuyBoxApp
{
    public class HAPParser
    {
        public class Seller
        {
            public double rating { get; set; }
            public string name { get; set; }
            public bool has_Promotion { get; set; }
            public List<string> promotions { get; set; }
            public bool has_Basket_Discount { get; set; }
            public string basket_Discount { get; set; }
            public double basket_Discount_Price { get; set; }
            public double selling_Price { get; set; }
            public int selling_Stock { get; set; }
        }
        public int productRatingCount = -1;
        public int productCommentCount = -1;
        public Seller buyBoxSeller { get; set; }
        public List<Seller> other_Sellers { get; set; }
        public string productLink { get; set; }
        public bool has_BuyBox_Seller { get; set; }
        public bool has_Other_Sellers { get; set; }
        HtmlDocument productPage { get; set; }
        public HAPParser(int productContentId, string barcode)
        {
            string product_Link = string.Format("https://www.trendyol.com/marka/urun-p-{0}", productContentId.ToString());
            HtmlWeb web = new HtmlWeb();
            web.UseCookies = true;
            this.productPage = web.Load(product_Link);
            this.productLink = web.ResponseUri.AbsoluteUri;

            var productDataJsonText = productPage.DocumentNode.SelectSingleNode("/html/body/script[1]/text()")?.InnerText;
            var beginningIndex = productDataJsonText.IndexOf("{\"product\"");
            var productJson = productDataJsonText.Substring(beginningIndex, productDataJsonText.IndexOf("}};") - beginningIndex + 2);

            ParseDataFromObject(productJson);

            //var buyBoxNode = productPage.DocumentNode.SelectSingleNode("//div[@class='product-container']");
            //this.buyBoxSeller = getBuyBoxSeller(buyBoxNode);
            //this.other_Sellers = new List<Seller>();
            //fill_Other_Sellers();
            //int[] ratings = getRatings();
            //this.productCommentCount = ratings[0];
            //this.productRatingCount = ratings[1];
        }

        private void ParseDataFromObject(string productJson)
        {
            var jsonData = JsonConvert.DeserializeObject<dynamic>(productJson);
            var product = jsonData.product;
            var local_buyboxSeller = product?.merchantListings[0] ?? null;

            this.other_Sellers = new List<Seller>();
            this.buyBoxSeller = GetSellerFromJson(local_buyboxSeller);

            JArray merchantListings = product?.merchantListings;
            merchantListings.Remove(merchantListings.FirstOrDefault());
            foreach (var merchantListing in merchantListings)
            {
                var tempSeller = GetSellerFromJson(merchantListing);

                other_Sellers.Add(tempSeller);
            }

            this.productCommentCount = product.ratingScore.totalCommentCount;
            this.productRatingCount = product.ratingScore.totalRatingCount;

            //this.buyBoxSeller.name = local_buyboxSeller.merchant?.name;
            //this.buyBoxSeller.rating = local_buyboxSeller.merchant?.sellerScore;
            //this.buyBoxSeller.has_Promotion = local_buyboxSeller.promotions?.Count > 0;
            //var discountedPrice = (double)local_buyboxSeller.variants[0]?.price?.discountedPrice;
            //var couponApplicablePrice = (double)local_buyboxSeller.variants[0]?.price?.couponApplicablePrice;
            //var couponApplicableRate = Math.Round(1 - ((couponApplicablePrice * 1.0) / (discountedPrice * 1.0)), 2);
            //this.buyBoxSeller.has_Basket_Discount = discountedPrice != couponApplicablePrice;

            //this.buyBoxSeller.basket_Discount = $"Sepette %{Math.Round(couponApplicableRate * 100)} indirim";
            //this.buyBoxSeller.basket_Discount_Price = couponApplicablePrice;
            //this.buyBoxSeller.selling_Price = discountedPrice;
            //this.buyBoxSeller.rating = local_buyboxSeller?.variants[0]?.quantity;



        }

        private Seller GetSellerFromJson(dynamic sellerObject)
        {
            try
            {
                var seller = new Seller();

                var discountedPrice = (double)sellerObject.variants[0]?.price?.discountedPrice;
                var couponApplicablePrice = (double)sellerObject.variants[0]?.price?.couponApplicablePrice;
                var couponApplicableRate = Math.Round(1 - ((couponApplicablePrice * 1.0) / (discountedPrice * 1.0)), 2);

                seller.name = sellerObject.merchant?.name;
                seller.name = seller.name.Trim();
                seller.rating = sellerObject.merchant?.sellerScore ?? -1;
                seller.has_Promotion = sellerObject.promotions?.Count > 0;
                seller.has_Basket_Discount = discountedPrice != couponApplicablePrice;
                seller.basket_Discount = $"Sepette %{Math.Round(couponApplicableRate * 100)} indirim";
                seller.basket_Discount_Price = couponApplicablePrice;
                seller.selling_Price = discountedPrice;
                var isQuantityNull = sellerObject?.variants[0]?.quantity == null;
                seller.selling_Stock = isQuantityNull ? 0 : sellerObject?.variants[0]?.quantity;
                seller.promotions = new List<string>();

                return seller;
            }
            catch (Exception exc)
            {

                throw;
            }
        }

        Seller getBuyBoxSeller(HtmlNode buyBoxNode)
        {
            check_Has_Seller(buyBoxNode);
            var temp_selling_Price = -1.0;
            var temp_has_Basket_Discount = false;
            var temp_basket_Discount = string.Empty;
            var temp_basket_Discount_Price = -1.0;
            var temp_has_Promotion = false;
            var temp_promotions = new List<string>();
            var temp_Name = "No Seller";
            var temp_Selling_Stock = -1;
            var temp_rating = -1.0;
            if (has_BuyBox_Seller)
            {
                var price_Node = buyBoxNode.SelectSingleNode("//div[@class='product-price-container']");
                var has_basket_discount = price_Node.SelectSingleNode("//div[@class='discounted-stamp']") == null && price_Node.SelectSingleNode("//div[@class='pr-bx-pr-dsc']") != null;
                if (!has_basket_discount)
                {
                    temp_selling_Price = Convert.ToDouble(price_Node.SelectSingleNode("//span[@class='prc-dsc']").InnerText.Split()[0], System.Globalization.CultureInfo.CurrentCulture);
                }
                else
                {
                    var basket_Node = price_Node.SelectSingleNode("//div[@class='pr-bx-pr-dsc']");
                    temp_selling_Price = -1;
                    temp_has_Basket_Discount = true;
                    temp_basket_Discount = basket_Node.FirstChild.InnerText;
                    temp_basket_Discount_Price = Convert.ToDouble(basket_Node.SelectSingleNode("//span[@class='prc-dsc']").InnerText.Split()[0], System.Globalization.CultureInfo.CurrentCulture);
                }
                var promotion_Node = productPage.DocumentNode.SelectSingleNode("//div[@class='product-widget-list']");
                temp_has_Promotion = promotion_Node.ChildNodes.Count == 3;
                var seller_Name_Node = buyBoxNode.SelectSingleNode("//a[@class='merchant-text']");
                temp_Name = seller_Name_Node?.InnerText?.Trim() ?? "No Seller";
                bool has_Rating = seller_Name_Node?.SelectSingleNode("//div[@class='sl-pn']") != null;
                temp_rating = has_Rating ? Convert.ToDouble(seller_Name_Node.SelectSingleNode("//div[@class='sl-pn']").InnerText) : -1.0;
                var product_info_list_node = seller_Name_Node.SelectSingleNode("//ul[@id='content-descriptions-list']");
                var product_info_list_child_nodes = product_info_list_node.ChildNodes;
                var selling_stock_string = string.Empty;
                foreach (var item in product_info_list_child_nodes.Reverse<HtmlNode>())
                {
                    if (item.InnerText.Contains("Kampanya fiyatından satılmak üzere"))
                    {
                        selling_stock_string = item.InnerText;
                        break;
                    }
                }
                var low_stock_node = productPage.DocumentNode.SelectSingleNode("//span[@class='stck-msg no-variant']");
                if (low_stock_node != null)
                {
                    temp_Selling_Stock = Convert.ToInt32(low_stock_node.InnerText.Split()[1]);
                }
                else
                {
                    if (selling_stock_string != string.Empty)
                    {
                        if (selling_stock_string.Split()[0].ToString() == "Kampanya")
                        {
                            temp_Selling_Stock = Convert.ToInt32(selling_stock_string.Split()[4]);
                        }
                        else
                        {
                            temp_Selling_Stock = Convert.ToInt32(selling_stock_string.Split()[17]);
                        }
                    }
                }
            }
            return new Seller()
            {
                selling_Price = temp_selling_Price,
                has_Basket_Discount = temp_has_Basket_Discount,
                basket_Discount = temp_basket_Discount,
                basket_Discount_Price = temp_basket_Discount_Price,
                has_Promotion = temp_has_Promotion,
                promotions = temp_promotions,
                name = temp_Name,
                selling_Stock = temp_Selling_Stock,
                rating = temp_rating
            };

        }
        void fill_Other_Sellers()
        {
            check_Other_Sellers();
            if (has_Other_Sellers)
            {

                var other_Seller_Nodes = productPage.DocumentNode.SelectSingleNode("//div[@class='omc-cntr']").ChildNodes;
                foreach (var node in other_Seller_Nodes)
                {
                    var left_Node = node.ChildNodes[0];
                    var right_Node = node.ChildNodes[1];
                    var basket_Node = right_Node.SelectSingleNode(".//div[@class='mrc-new-prc']");
                    var temp_has_Basket_Discount = basket_Node != null;
                    var temp_has_Promotion = false;
                    if (left_Node.SelectSingleNode(".//div[@class='pr-mb-prs']") != null)
                    {
                        temp_has_Promotion = left_Node.SelectSingleNode(".//div[@class='pr-mb-pr-tx break']") != null || left_Node.SelectSingleNode(".//div[@class='pr-mb-pr-tx']") != null;
                    }
                    var temp_selling_Price = temp_has_Basket_Discount ? -1 : Convert.ToDouble(right_Node.SelectSingleNode(".//span[@class='prc-dsc']").InnerText.Split()[0]);
                    string temp_basket_Discount = string.Empty;
                    var temp_basket_Discount_Price = temp_has_Basket_Discount ?
                        Convert.ToDouble(right_Node.SelectSingleNode(".//span[@class='prc-dsc']").InnerText.Split()[0]) : -1;
                    var temp_promotions = new List<string>();
                    if (temp_has_Promotion) temp_promotions.Add(left_Node.SelectSingleNode(".//div[@class='pr-mb-prs']").FirstChild.InnerText);
                    var temp_Name = left_Node.SelectSingleNode(".//div[@class='pr-mb-mn']").FirstChild.InnerText.Trim();
                    var temp_Selling_Stock = -1;
                    var temp_has_Rating = left_Node.SelectSingleNode(".//div[@class='sl-pn']") != null;
                    var temp_rating = temp_has_Rating ?
                        Convert.ToDouble(left_Node.SelectSingleNode(".//div[@class='sl-pn']").InnerText) : -1;
                    other_Sellers.Add(new Seller()
                    {
                        selling_Price = temp_selling_Price,
                        has_Basket_Discount = temp_has_Basket_Discount,
                        basket_Discount = temp_basket_Discount,
                        basket_Discount_Price = temp_basket_Discount_Price,
                        has_Promotion = temp_has_Promotion,
                        promotions = temp_promotions,
                        name = temp_Name,
                        selling_Stock = temp_Selling_Stock,
                        rating = temp_rating
                    });
                }
            }
        }
        int[] getRatings()
        {
            int[] toReturn = { 0, 0 };
            try
            {
                if (has_BuyBox_Seller)
                {
                    HtmlNode htmlNode = productPage.DocumentNode.SelectSingleNode("//div[@class='pr-in-ratings']");
                    if (htmlNode.SelectSingleNode("//div[@class='pr-in-rnr']") == null)
                    {
                        return toReturn;
                    }
                    else
                    {
                        var rating_node = htmlNode.SelectSingleNode("//a[@class='rvw-cnt-tx']");
                        int ratingCount = rating_node == null ? 0 : Convert.ToInt32(rating_node.InnerText.Split()[0]);
                        var comment_node = htmlNode.SelectSingleNode("//a[@class='product-questions']");
                        int commentCount = comment_node == null ? 0 : Convert.ToInt32(comment_node.InnerText.Split()[0]);
                        toReturn[0] = commentCount;
                        toReturn[1] = ratingCount;
                        return toReturn;
                    }
                }
                else
                {
                    return toReturn;
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HAPParser", "getRatings", exc);
                return toReturn;
            }
        }
        void check_Has_Seller(HtmlNode buyBoxNode)
        {

            if (buyBoxNode != null && buyBoxNode.SelectSingleNode("//div[@class='product-price-container']") != null)
            {
                var button_node = buyBoxNode.SelectSingleNode("//div[@class='product-button-container']");
                var has_seller = button_node.SelectSingleNode("//div[@class='add-to-basket sold-out']") == null && button_node.SelectSingleNode("//div[@class='add-to-basket sold-out small']") == null;
                this.has_BuyBox_Seller = has_seller;
            }
        }
        void check_Other_Sellers()
        {
            var other_Sellers_Node = productPage.DocumentNode.SelectSingleNode("//div[@class='omc-cntr']");
            if (other_Sellers_Node == null)
            {
                has_Other_Sellers = false;
            }
            else
            {
                has_Other_Sellers = true;
            }

        }
    }
}
