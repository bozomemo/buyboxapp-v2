using System;
using System.Collections.Generic;

namespace BuyBoxApp.AutomateWorks
{
    public static class TYAutoBB
    {
        static double price_change_rate_default = 0.1;
        static double default_threshold_value = 1;
        static double price_change_rate_less_scnd = 1.0;
        static double scnd_threshold_value = 5;
        static double price_change_rate_more_scnd_threshold = 4.0;
        static double only_seller_price_multiplier = 1.2;
        static double low_stock_if_sell_multiplier = 1.1;
        static int lowest_stock_limit = 5;
        static string store_name = "farmaucuz";

        public struct Optimum_Price_Values
        {
            /// <summary>
            /// cuprc = Current_Unit_Price
            /// bcsp = Before_Change_Selling_Price
            /// acsp = After_Change_Selling_Price
            /// bcib = Before_Change_In_Buybox
            /// bcbprc = Before_Change_Buybox_Price
            /// bcbprm = Before_Change_Buybox_Promotions
            /// ssprc = Second_Seller_Price
            /// ssprm = Second_Seller_Promotions
            /// bccr = BeforeChangeCommissionRate
            /// </summary>

            public string Barcode { get; set; }
            public double cuprc { get; set; }
            public double bcsp { get; set; }
            public double acsp { get; set; }
            public bool bcib { get; set; }
            public double bcbprc { get; set; }
            public string bcbprm { get; set; }
            public double ssprc { get; set; }
            public string ssprm { get; set; }
            public double bccr { get; set; }
        }

        public static void Get_Buybox(TYProductCard productCard, TrendyolAPI.FilterProducts.ProductCardInfo.Content content, bool get_buybox_activated)
        {
            try
            {
                var panelSellingPrice = content.salePrice;
                var optimum_price_values = GetOptimum_Price_Values(productCard.barcode);
                var has_error = content.quantity == 0 && productCard.buyBoxSeller.name == "No Seller";
                var isCloseOut = content.salePrice < productCard.lowestSellablePrice;
                if (isCloseOut)
                {
                    if (productCard.increase_price && get_buybox_activated && !has_error)
                    {
                        var buybox_seller_promotion = productCard.buyBoxSeller.has_Promotion ? productCard.buyBoxSeller.promotions[0] : string.Empty;
                        var second_seller_price = productCard.second_Seller.has_Basket_Discount ? productCard.second_Seller.basket_Discount_Price : productCard.second_Seller.selling_Price;
                        var second_seller_promotion = productCard.second_Seller.has_Promotion && productCard.second_Seller.promotions.Count > 0 ? productCard.second_Seller.promotions[0] : string.Empty;
                        var alteredPrice = content.salePrice + price_change_rate_less_scnd;
                        APIOperations.Update_price(alteredPrice, content);
                        Insert_Optimum_price_values(new Optimum_Price_Values
                        {
                            Barcode = productCard.barcode,
                            cuprc = productCard.unitPrice,
                            bcsp = productCard.buyBoxSeller.basket_Discount_Price,
                            acsp = alteredPrice,
                            bcib = true,
                            bcbprc = productCard.buyBoxSeller.basket_Discount_Price,
                            bcbprm = buybox_seller_promotion,
                            ssprc = second_seller_price,
                            ssprm = second_seller_promotion,
                            bccr = productCard.commission
                        });
                    }
                }
                else
                {
                    if (productCard.inBuyBox)
                    {
                        // We are in buybox.
                        if (productCard.buyBoxSeller.has_Basket_Discount)
                        {
                            // We are in buybox.
                            // Price doesn't have an upper limit and can be increased.
                            // We have a basket discount.
                            if (productCard.second_Seller != null)
                            {
                                // We are in buybox.
                                // Price doesn't have an upper limit and can be increased.
                                // We have a basket discount.
                                // Product card has a second seller.
                                var buybox_seller_promotion = productCard.buyBoxSeller.has_Promotion && productCard.buyBoxSeller.promotions.Count > 0 ? productCard.buyBoxSeller.promotions[0] : string.Empty;
                                var second_seller_price = productCard.second_Seller.has_Basket_Discount ? productCard.second_Seller.basket_Discount_Price : productCard.second_Seller.selling_Price;
                                var price_difference = productCard.buyBoxSeller.basket_Discount_Price - second_seller_price;
                                var current_price_without_exp = Functions.Get_price_without_expenditure(productCard.buyBoxSeller.basket_Discount_Price, productCard.commission);
                                var changed_price_without_expenditure = current_price_without_exp + get_price_to_add(productCard.inBuyBox, price_difference);
                                if (changed_price_without_expenditure < productCard.unitPrice)
                                {
                                    changed_price_without_expenditure = productCard.unitPrice;
                                }
                                var price_to_get_close = Functions.calcMinPrice(changed_price_without_expenditure, productCard.commission);
                                var basket_ratio = productCard.buyBoxSeller.basket_Discount_Price / panelSellingPrice;
                                var altered_price = price_to_get_close / basket_ratio;
                                // Checking if second seller has anything changed.
                                var commissionRateChanged = productCard.commission != optimum_price_values.bccr;
                                var current_unit_price_changed = productCard.unitPrice != optimum_price_values.cuprc;
                                var second_seller_price_changed = second_seller_price != optimum_price_values.ssprc;
                                var second_seller_promotion = productCard.second_Seller.has_Promotion && productCard.second_Seller.promotions.Count > 0 ? productCard.second_Seller.promotions[0] : string.Empty;
                                var second_seller_promotions_changed = second_seller_promotion != optimum_price_values.ssprm;
                                var just_got_buybox = !optimum_price_values.bcib;
                                if (just_got_buybox)
                                {
                                    second_seller_price_changed = optimum_price_values.bcbprc != second_seller_price;
                                    second_seller_promotion = productCard.buyBoxSeller.has_Promotion && productCard.buyBoxSeller.promotions.Count > 0 ? productCard.buyBoxSeller.promotions[0] : string.Empty;
                                    second_seller_promotions_changed = second_seller_promotion != optimum_price_values.ssprm;
                                }
                                if (second_seller_price_changed || second_seller_promotions_changed || current_unit_price_changed || commissionRateChanged || !just_got_buybox)
                                {
                                    if (productCard.increase_price && get_buybox_activated && !has_error)
                                    {
                                        APIOperations.Update_price(altered_price, content);
                                        Insert_Optimum_price_values(new Optimum_Price_Values
                                        {
                                            Barcode = productCard.barcode,
                                            cuprc = productCard.unitPrice,
                                            bcsp = productCard.buyBoxSeller.basket_Discount_Price,
                                            acsp = altered_price,
                                            bcib = true,
                                            bcbprc = productCard.buyBoxSeller.basket_Discount_Price,
                                            bcbprm = buybox_seller_promotion,
                                            ssprc = second_seller_price,
                                            ssprm = second_seller_promotion,
                                            bccr = productCard.commission
                                        });
                                    }
                                }
                            }
                            else
                            {
                                // We are in buybox.
                                // Price doesn't have an upper limit and can be increased.
                                // We have a basket discount.
                                // Product card doesn't have a second seller.

                                var second_seller_price = -1;
                                var second_seller_promotion = string.Empty;
                                var buybox_seller_promotion = productCard.buyBoxSeller.has_Promotion && productCard.buyBoxSeller.promotions.Count > 0 ? productCard.buyBoxSeller.promotions[0] : string.Empty;
                                var basket_ratio = productCard.buyBoxSeller.basket_Discount_Price / panelSellingPrice;
                                var product_card_original_price = productCard.original_unit_price == 0 ? productCard.unitPrice : productCard.original_unit_price;
                                var price_without_exp = product_card_original_price * only_seller_price_multiplier;
                                var price_to_get_close = Functions.calcMinPrice(price_without_exp, productCard.commission);
                                var altered_price = price_to_get_close / basket_ratio;
                                if (productCard.increase_price && get_buybox_activated && !has_error)
                                {
                                    APIOperations.Update_price(altered_price, content);
                                    Insert_Optimum_price_values(new Optimum_Price_Values
                                    {
                                        Barcode = productCard.barcode,
                                        cuprc = productCard.unitPrice,
                                        bcsp = productCard.buyBoxSeller.basket_Discount_Price,
                                        acsp = altered_price,
                                        bcib = true,
                                        bcbprc = productCard.buyBoxSeller.basket_Discount_Price,
                                        bcbprm = buybox_seller_promotion,
                                        ssprc = second_seller_price,
                                        ssprm = second_seller_promotion,
                                        bccr = productCard.commission
                                    });
                                }
                            }
                        }
                        else
                        {
                            // We are in buybox.
                            // Price doesn't have an upper limit and can be increased.
                            // We don't have basket discount.
                            if (productCard.second_Seller != null)
                            {
                                // We are in buybox.
                                // Price doesn't have an upper limit and can be increased.
                                // We don't have basket discount.
                                // Product card has a second seller.
                                var selling_price = productCard.buyBoxSeller.selling_Price;
                                var current_price_without_exp = Functions.Get_price_without_expenditure(selling_price, productCard.commission);
                                var second_seller_price = productCard.second_Seller.has_Basket_Discount ? productCard.second_Seller.basket_Discount_Price : productCard.second_Seller.selling_Price;
                                var price_difference = selling_price - second_seller_price;
                                var changed_price_without_exp = current_price_without_exp + get_price_to_add(productCard.inBuyBox, price_difference);
                                if (changed_price_without_exp < productCard.unitPrice)
                                {
                                    changed_price_without_exp = productCard.unitPrice;
                                }
                                double price_to_get_close = Functions.calcMinPrice(changed_price_without_exp, productCard.commission);
                                // Checking if second seller has anything changed.
                                var commissionRateChanged = productCard.commission != optimum_price_values.bccr;
                                var current_unit_price_changed = productCard.unitPrice != optimum_price_values.cuprc;
                                var buybox_seller_promotion = productCard.buyBoxSeller.has_Promotion && productCard.buyBoxSeller.promotions.Count > 0 ? productCard.buyBoxSeller.promotions[0] : string.Empty;
                                var second_seller_price_changed = second_seller_price != optimum_price_values.ssprc;
                                var second_seller_promotion = productCard.second_Seller.has_Promotion && productCard.second_Seller.promotions.Count > 0 ? productCard.second_Seller.promotions[0] : string.Empty;
                                var second_seller_promotions_changed = second_seller_promotion != optimum_price_values.ssprm;
                                var just_got_buybox = !optimum_price_values.bcib;
                                if (just_got_buybox)
                                {
                                    second_seller_price_changed = optimum_price_values.bcbprc != second_seller_price;
                                    second_seller_promotion = productCard.buyBoxSeller.has_Promotion && productCard.buyBoxSeller.promotions.Count > 0 ? productCard.buyBoxSeller.promotions[0] : string.Empty;
                                    second_seller_promotions_changed = second_seller_promotion != optimum_price_values.ssprm;
                                }
                                if (second_seller_price_changed || second_seller_promotions_changed || current_unit_price_changed || commissionRateChanged || !just_got_buybox)
                                {
                                    if (productCard.increase_price && get_buybox_activated && !has_error)
                                    {
                                        APIOperations.Update_price(price_to_get_close, content);
                                        Insert_Optimum_price_values(new Optimum_Price_Values
                                        {
                                            Barcode = productCard.barcode,
                                            cuprc = productCard.unitPrice,
                                            bcsp = selling_price,
                                            acsp = price_to_get_close,
                                            bcib = true,
                                            bcbprc = selling_price,
                                            bcbprm = buybox_seller_promotion,
                                            ssprc = second_seller_price,
                                            ssprm = second_seller_promotion,
                                            bccr = productCard.commission
                                        });
                                    }
                                }
                            }
                            else
                            {
                                // We are in buybox.
                                // Price doesn't have an upper limit and can be increased.
                                // We don't have basket discount.
                                // Product card doesn't have a second seller.

                                var second_seller_price = -1;
                                var second_seller_promotion = string.Empty;
                                var selling_price = productCard.buyBoxSeller.selling_Price;
                                var original_unit_price = productCard.original_unit_price != 0 ? productCard.original_unit_price : productCard.unitPrice;
                                var price_without_expenditure = original_unit_price * only_seller_price_multiplier;
                                var new_price = Functions.calcMinPrice(price_without_expenditure, productCard.commission);
                                var buybox_seller_promotion = productCard.buyBoxSeller.has_Promotion && productCard.buyBoxSeller.promotions.Count > 0 ? productCard.buyBoxSeller.promotions[0] : string.Empty;
                                if (new_price != selling_price)
                                {
                                    if (productCard.increase_price && get_buybox_activated && !has_error)
                                    {
                                        APIOperations.Update_price(new_price, content);
                                        Insert_Optimum_price_values(new Optimum_Price_Values
                                        {
                                            Barcode = productCard.barcode,
                                            cuprc = productCard.unitPrice,
                                            bcsp = selling_price,
                                            acsp = new_price,
                                            bcib = true,
                                            bcbprc = productCard.buyBoxSeller.basket_Discount_Price,
                                            bcbprm = buybox_seller_promotion,
                                            ssprc = second_seller_price,
                                            ssprm = second_seller_promotion,
                                            bccr = productCard.commission
                                        });
                                    }
                                }
                            }
                        }
                    }
                    else
                    {
                        // We are not in Buybox.
                        if (productCard.sellingStock == 0)
                        {
                            // We are not in Buybox.
                            // Trendyol selling stock is zero.
                        }
                        else
                        {
                            // We are not in Buybox.
                            // Trendyol selling stock is not zero.
                            // We are not in Buybox.
                            // We should decrease price like normal calculating that part.
                            var current_position = get_current_position(productCard);
                            var buybox_selling_price = productCard.buyBoxSeller.has_Basket_Discount ? productCard.buyBoxSeller.basket_Discount_Price : productCard.buyBoxSeller.selling_Price;
                            var buybox_seller_promotion = productCard.buyBoxSeller.has_Promotion && productCard.buyBoxSeller.promotions.Count > 0 ? productCard.buyBoxSeller.promotions[0] : string.Empty;
                            //var second_seller_price = productCard.second_Seller.has_Basket_Discount ? productCard.buyBoxSeller.basket_Discount_Price : productCard.second_Seller.selling_Price;
                            var second_seller_price = productCard.second_Seller != null ?
                                productCard.second_Seller.has_Basket_Discount ? productCard.second_Seller.basket_Discount_Price : productCard.second_Seller.selling_Price : -1.0;
                            //var second_seller_promotion = productCard.second_Seller.has_Promotion ? productCard.second_Seller.promotions[0] : string.Empty;
                            var second_seller_promotion = productCard.second_Seller != null && productCard.second_Seller.promotions?.Count > 0 ? productCard.second_Seller.has_Promotion ? productCard.second_Seller.promotions[0] : string.Empty : string.Empty;
                            var thirdSellerPrice = productCard.third_Seller != null ?
                                productCard.third_Seller.has_Basket_Discount ? productCard.third_Seller.basket_Discount_Price : productCard.third_Seller.selling_Price : -1.0;
                            if (current_position != -1)
                            {
                                // We are not in Buybox.
                                // Trendyol selling stock is not zero.
                                // We are among top 5 sellers.
                                if (current_position == 2)
                                {
                                    // We are not in Buybox.
                                    // Trendyol selling stock is not zero.
                                    // We are among top 5 sellers.
                                    // We are currently second seller.

                                    var buybox_seller_stock = productCard.buyBoxSeller.selling_Stock;
                                    var have_basket_discount = productCard.second_Seller.has_Basket_Discount;
                                    var basket_ratio = have_basket_discount ? productCard.second_Seller.basket_Discount_Price / panelSellingPrice : 1.0;
                                    var current_selling_price = have_basket_discount ? productCard.second_Seller.basket_Discount_Price : productCard.second_Seller.selling_Price;
                                    var price_difference = current_selling_price - buybox_selling_price;
                                    var price_without_expenditure = Functions.Get_price_without_expenditure(current_selling_price, productCard.commission);
                                    var price_to_add = buybox_selling_price < 30 && current_selling_price > 34.6 ? -0.1 : get_price_to_add(productCard.inBuyBox, price_difference);
                                    var changed_price_without_expenditure = price_without_expenditure + price_to_add;
                                    var final_selling_price = Functions.calcMinPrice(changed_price_without_expenditure, productCard.commission);


                                    if (final_selling_price >= productCard.lowestSellablePrice)
                                    {
                                        // price is profitable to get lower.
                                        if (buybox_seller_stock < lowest_stock_limit)
                                        {
                                            // Buybox seller has few stock.
                                            var low_stock_sellable_price = price_without_expenditure * low_stock_if_sell_multiplier;
                                            var min_selling_price = Functions.calcMinPrice(low_stock_sellable_price, productCard.commission);
                                            if (min_selling_price <= buybox_selling_price)
                                            {
                                                // Even though buybox seller has few stock, it is profitable enough to get buybox.
                                                if (final_selling_price != current_selling_price)
                                                {
                                                    final_selling_price = have_basket_discount ? final_selling_price / basket_ratio : final_selling_price;
                                                    if (productCard.decrease_price && get_buybox_activated && !has_error)
                                                    {
                                                        APIOperations.Update_price(final_selling_price, content);
                                                        Insert_Optimum_price_values(new Optimum_Price_Values
                                                        {
                                                            Barcode = productCard.barcode,
                                                            cuprc = productCard.unitPrice,
                                                            bcsp = current_selling_price,
                                                            acsp = final_selling_price,
                                                            bcib = productCard.inBuyBox,
                                                            bcbprc = buybox_selling_price,
                                                            bcbprm = buybox_seller_promotion,
                                                            ssprc = second_seller_price,
                                                            ssprm = second_seller_promotion,
                                                            bccr = productCard.commission
                                                        });
                                                    }
                                                }
                                            }
                                            else
                                            {
                                                // Don't change price.
                                            }
                                        }
                                        else
                                        {
                                            // Buybox seller has high stock.
                                            final_selling_price = have_basket_discount ? final_selling_price / basket_ratio : final_selling_price;
                                            if (productCard.decrease_price && get_buybox_activated && !has_error)
                                            {
                                                APIOperations.Update_price(final_selling_price, content);
                                                Insert_Optimum_price_values(new Optimum_Price_Values
                                                {
                                                    Barcode = productCard.barcode,
                                                    cuprc = productCard.unitPrice,
                                                    bcsp = current_selling_price,
                                                    acsp = final_selling_price,
                                                    bcib = productCard.inBuyBox,
                                                    bcbprc = buybox_selling_price,
                                                    bcbprm = buybox_seller_promotion,
                                                    ssprc = second_seller_price,
                                                    ssprm = second_seller_promotion,
                                                    bccr = productCard.commission
                                                });
                                            }
                                        }
                                    }
                                }
                                else if (current_position == 3)
                                {
                                    // We are not in Buybox.
                                    // Trendyol selling stock is not zero.
                                    // We are among top 5 sellers.
                                    // We are currently third seller.
                                    var have_basket_discount = productCard.third_Seller.has_Basket_Discount;
                                    var basket_ratio = have_basket_discount ? productCard.third_Seller.basket_Discount_Price / panelSellingPrice : 1f;
                                    var current_selling_price = have_basket_discount ? productCard.third_Seller.basket_Discount_Price : productCard.third_Seller.selling_Price;
                                    var price_difference = current_selling_price - buybox_selling_price;
                                    var price_without_expenditure = Functions.Get_price_without_expenditure(current_selling_price, productCard.commission);
                                    var price_to_add = buybox_selling_price < 30 && current_selling_price > 34.6 ? -0.1 : get_price_to_add(productCard.inBuyBox, price_difference);
                                    var changed_price_without_expenditure = price_without_expenditure + price_to_add;
                                    var final_selling_price = Functions.calcMinPrice(changed_price_without_expenditure, productCard.commission);
                                    if (final_selling_price >= productCard.lowestSellablePrice)
                                    {
                                        final_selling_price = have_basket_discount ? final_selling_price / basket_ratio : final_selling_price;
                                        if (productCard.decrease_price && get_buybox_activated && !has_error)
                                        {
                                            APIOperations.Update_price(final_selling_price, content);
                                            Insert_Optimum_price_values(new Optimum_Price_Values
                                            {
                                                Barcode = productCard.barcode,
                                                cuprc = productCard.unitPrice,
                                                bcsp = current_selling_price,
                                                acsp = final_selling_price,
                                                bcib = productCard.inBuyBox,
                                                bcbprc = buybox_selling_price,
                                                bcbprm = buybox_seller_promotion,
                                                ssprc = second_seller_price,
                                                ssprm = second_seller_promotion,
                                                bccr = productCard.commission
                                            });
                                        }
                                    }
                                }
                                else if (current_position == 4)
                                {
                                    // We are not in Buybox.
                                    // Trendyol selling stock is not zero.
                                    // We are among top 5 sellers.
                                    // We are currently fourth seller.
                                    var have_basket_discount = productCard.fourth_Seller.has_Basket_Discount;
                                    var basket_ratio = have_basket_discount ? productCard.fourth_Seller.basket_Discount_Price / panelSellingPrice : 1f;
                                    var current_selling_price = have_basket_discount ? productCard.fourth_Seller.basket_Discount_Price : productCard.fourth_Seller.selling_Price;
                                    var price_difference = current_selling_price - buybox_selling_price;
                                    var price_without_expenditure = Functions.Get_price_without_expenditure(current_selling_price, productCard.commission);
                                    var price_to_add = buybox_selling_price < 30 && current_selling_price > 34.6 ? -0.1 : get_price_to_add(productCard.inBuyBox, price_difference);
                                    var changed_price_without_expenditure = price_without_expenditure + price_to_add;
                                    var final_selling_price = Functions.calcMinPrice(changed_price_without_expenditure, productCard.commission);
                                    if (final_selling_price >= productCard.lowestSellablePrice)
                                    {
                                        final_selling_price = have_basket_discount ? final_selling_price / basket_ratio : final_selling_price;
                                        if (productCard.decrease_price && get_buybox_activated && !has_error)
                                        {
                                            APIOperations.Update_price(final_selling_price, content);
                                            Insert_Optimum_price_values(new Optimum_Price_Values
                                            {
                                                Barcode = productCard.barcode,
                                                cuprc = productCard.unitPrice,
                                                bcsp = current_selling_price,
                                                acsp = final_selling_price,
                                                bcib = productCard.inBuyBox,
                                                bcbprc = buybox_selling_price,
                                                bcbprm = buybox_seller_promotion,
                                                ssprc = second_seller_price,
                                                ssprm = second_seller_promotion,
                                                bccr = productCard.commission
                                            });
                                        }
                                    }
                                }
                                else if (current_position == 5)
                                {
                                    // We are not in Buybox.
                                    // Trendyol selling stock is not zero.
                                    // We are among top 5 sellers.
                                    // We are currently fifth seller.
                                    var have_basket_discount = productCard.fifth_Seller.has_Basket_Discount;
                                    var basket_ratio = have_basket_discount ? productCard.fifth_Seller.basket_Discount_Price / panelSellingPrice : 1f;
                                    var current_selling_price = have_basket_discount ? productCard.fifth_Seller.basket_Discount_Price : productCard.fifth_Seller.selling_Price;
                                    var price_difference = current_selling_price - buybox_selling_price;
                                    var price_without_expenditure = Functions.Get_price_without_expenditure(current_selling_price, productCard.commission);
                                    var price_to_add = buybox_selling_price < 30 && current_selling_price > 34.6 ? -0.1 : get_price_to_add(productCard.inBuyBox, price_difference);
                                    var changed_price_without_expenditure = price_without_expenditure + price_to_add;
                                    var final_selling_price = Functions.calcMinPrice(changed_price_without_expenditure, productCard.commission);
                                    if (final_selling_price >= productCard.lowestSellablePrice)
                                    {
                                        final_selling_price = have_basket_discount ? final_selling_price / basket_ratio : final_selling_price;
                                        if (productCard.decrease_price && get_buybox_activated && !has_error)
                                        {
                                            APIOperations.Update_price(final_selling_price, content);
                                            Insert_Optimum_price_values(new Optimum_Price_Values
                                            {
                                                Barcode = productCard.barcode,
                                                cuprc = productCard.unitPrice,
                                                bcsp = current_selling_price,
                                                acsp = final_selling_price,
                                                bcib = productCard.inBuyBox,
                                                bcbprc = buybox_selling_price,
                                                bcbprm = buybox_seller_promotion,
                                                ssprc = second_seller_price,
                                                ssprm = second_seller_promotion,
                                                bccr = productCard.commission
                                            });
                                        }
                                    }
                                }
                            }
                            else
                            {
                                // We are not in Buybox.
                                // Trendyol selling stock is not zero.
                                // We are not among top 5 sellers.
                                var current_selling_price = productCard.trendyolSellingPrice;
                                if (productCard.fifth_Seller != null)
                                {
                                    var price_difference = current_selling_price - buybox_selling_price;
                                    var price_without_expenditure = Functions.Get_price_without_expenditure(current_selling_price, productCard.commission);
                                    var price_to_add = buybox_selling_price < 30 && current_selling_price > 34.6 ? -0.1 : get_price_to_add(productCard.inBuyBox, price_difference);
                                    var changed_price_without_expenditure = price_without_expenditure + price_to_add;
                                    var final_selling_price = Functions.calcMinPrice(changed_price_without_expenditure, productCard.commission);
                                    if (final_selling_price >= productCard.lowestSellablePrice && final_selling_price >= buybox_selling_price)
                                    {
                                        if (productCard.decrease_price && get_buybox_activated && !has_error)
                                        {
                                            APIOperations.Update_price(final_selling_price, content);
                                            Insert_Optimum_price_values(new Optimum_Price_Values
                                            {
                                                Barcode = productCard.barcode,
                                                cuprc = productCard.unitPrice,
                                                bcsp = current_selling_price,
                                                acsp = final_selling_price,
                                                bcib = productCard.inBuyBox,
                                                bcbprc = buybox_selling_price,
                                                bcbprm = buybox_seller_promotion,
                                                ssprc = second_seller_price,
                                                ssprm = second_seller_promotion,
                                                bccr = productCard.commission
                                            });
                                        }
                                    }
                                }
                                else
                                {
                                    var price_difference = 8.0;
                                    var price_without_expenditure = Functions.Get_price_without_expenditure(current_selling_price, productCard.commission);
                                    var price_to_add = buybox_selling_price < 30 && current_selling_price > 34.6 ? -0.1 : get_price_to_add(productCard.inBuyBox, price_difference);
                                    var changed_price_without_expenditure = price_without_expenditure + price_to_add;
                                    var final_selling_price = Functions.calcMinPrice(changed_price_without_expenditure, productCard.commission);
                                    if (final_selling_price >= productCard.lowestSellablePrice && final_selling_price >= buybox_selling_price)
                                    {
                                        if (productCard.decrease_price && get_buybox_activated && !has_error)
                                        {
                                            APIOperations.Update_price(final_selling_price, content);
                                            Insert_Optimum_price_values(new Optimum_Price_Values
                                            {
                                                Barcode = productCard.barcode,
                                                cuprc = productCard.unitPrice,
                                                bcsp = current_selling_price,
                                                acsp = final_selling_price,
                                                bcib = productCard.inBuyBox,
                                                bcbprc = buybox_selling_price,
                                                bcbprm = buybox_seller_promotion,
                                                ssprc = second_seller_price,
                                                ssprm = second_seller_promotion,
                                                bccr = productCard.commission
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("TYAutoBB", "Get_Buybox", exc, stock_code: productCard.sellerStockCode, barcode: productCard.barcode);
            }
        }
        static Optimum_Price_Values GetOptimum_Price_Values(string barcode)
        {
            return SQLFunctions.GetOptimum_Price_Values(barcode);
        }
        static void Insert_Optimum_price_values(Optimum_Price_Values optimum_Price_Values)
        {
            SQLFunctions.Insert_Trace_Optimum_Price(optimum_Price_Values);
        }
        static int get_current_position(TYProductCard productCard)
        {
            var current_position = -1; // We are not in first five sellers.
            if (productCard.second_Seller != null)
            {
                if (productCard.second_Seller.name == store_name)
                {
                    current_position = 2;
                }
            }
            if (productCard.third_Seller != null)
            {
                if (productCard.third_Seller.name == store_name)
                {
                    current_position = 3;
                }
            }
            if (productCard.fourth_Seller != null)
            {
                if (productCard.fourth_Seller.name == store_name)
                {
                    current_position = 4;
                }
            }
            if (productCard.fifth_Seller != null)
            {
                if (productCard.fifth_Seller.name == store_name)
                {
                    current_position = 5;
                }
            }
            return current_position;
        }
        static double get_price_to_add(bool in_buybox, double price_difference)
        {
            // This func gets the optimal price to set.
            if (in_buybox)
            {
                if (price_difference > scnd_threshold_value * -1)
                {
                    if (price_difference > default_threshold_value * -1)
                    {
                        var price_to_add = price_change_rate_default;
                        return price_to_add;
                    }
                    else
                    {
                        var price_to_add = price_change_rate_less_scnd;
                        return price_to_add;
                    }
                }
                else
                {
                    var price_to_add = price_change_rate_more_scnd_threshold;
                    return price_to_add;
                }
            }
            else
            {
                if (price_difference < scnd_threshold_value)
                {
                    if (price_difference < default_threshold_value)
                    {
                        var price_to_add = price_change_rate_default * -1;
                        return price_to_add;
                    }
                    else
                    {
                        var price_to_add = price_change_rate_less_scnd * -1;
                        return price_to_add;
                    }
                }
                else
                {
                    var price_to_add = price_change_rate_more_scnd_threshold * -1;
                    return price_to_add;
                }
            }
        }
    }
}
