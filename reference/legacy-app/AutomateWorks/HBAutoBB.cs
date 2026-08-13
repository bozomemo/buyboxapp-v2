using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BuyBoxApp.AutomateWorks
{
    public static class HBAutoBB
    {
        private static string storeName;
        private static double firstCargoPrice;
        private static double secondCargoPrice;
        private static double thirdCargoPrice;
        private static double marketingExpenditure;
        private static double marketingExpenditureLimit;
        private static List<DataHolderClasses.Product.HBProduct> priceChangeList;
        private static byte priceChangeListCapacity;
        private static double minPriceChangeRate;
        private static double commissionRateVat;


        private static bool settingsImported;
        public struct HbPriceChange
        {
            public string hbSku;
            public double currentUnitPrice;
            public double beforeChangeSellingPrice;
            public double afterChangeSellingPrice;
            public double basketRatio;
            public double commissionRate;
            public double beforeChangeBuxboxPrice;
            public double beforeChangeSecondSellerPrice;
            public bool beforeChangeInBuybox;

        }
        public static void TrialCodes()
        {

        }
        public static void AutoChangePrice(System.Data.DataRow listingRow)
        {
            try
            {
                // Check if is salable and autoBB is active.
                if (!settingsImported) ImportSettings();
                var increasePrice = Convert.ToBoolean(listingRow["IncreasePrice"]);
                var decreasePrice = Convert.ToBoolean(listingRow["DecreasePrice"]);
                var hbPriceChange = Database.HepsiBuradaMySql.GetHbPriceChange(listingRow["HepsiburadaSku"].ToString());
                var isSalable = Convert.ToBoolean(listingRow["IsSalable"]);
                var buyboxSellerRatingName = listingRow["BuyboxMerchantRatingName"].ToString();
                var buyboxSellerName = buyboxSellerRatingName != "< ? >" ? buyboxSellerRatingName.Split('/')[1].Trim() : "< ? >";
                var buyboxSellerPriceStr = listingRow["BuyboxMerchantPrice"].ToString();
                var buyboxSellerPrice = buyboxSellerPriceStr != "< ? >" ? Convert.ToDouble(buyboxSellerPriceStr.Split('/')[1].Trim(), System.Globalization.CultureInfo.InvariantCulture) : -1;
                var secondSellerPriceStr = listingRow["SecondMerchantPrice"].ToString();
                var secondSellerPrice = secondSellerPriceStr != "< ? >" ? Convert.ToDouble(secondSellerPriceStr.Split('/')[1].Trim(), System.Globalization.CultureInfo.InvariantCulture) : -1;
                var inBuybox = buyboxSellerName == storeName;
                var sellingPrice = Convert.ToDouble(listingRow["Price"]);
                var unitPrice = Convert.ToDouble(listingRow["ProductUnitPrice"]);
                var commissionRate = Convert.ToDouble(listingRow["CommissionRate"]) * commissionRateVat;
                var basketDiscountRatioStr = listingRow["BasketRatio"].ToString();
                var storeBasketDiscountRatio = Convert.ToDouble(basketDiscountRatioStr.Split('/')[0].Trim(), System.Globalization.CultureInfo.InvariantCulture);
                var hbBasketDiscountRatio = Convert.ToDouble(basketDiscountRatioStr.Split('/')[1].Trim(), System.Globalization.CultureInfo.InvariantCulture);
                var totalBasketDiscountRatio = hbBasketDiscountRatio + storeBasketDiscountRatio;
                var basketMultiplier = 1 - (totalBasketDiscountRatio / 100);
                var finalPrice = sellingPrice * basketMultiplier;
                var lowestSellablePrice = Convert.ToDouble(listingRow["LowestSellablePrice"]);
                var isCloseOut = Convert.ToDouble(listingRow["PriceWithoutExpenditure"]) < unitPrice;
                if (isCloseOut)
                {
                    if (increasePrice)
                    {
                        // Price is under lowest sellable price, Updating price to get it high enough.
                        var alteredPrice = Convert.ToDouble(listingRow["Price"]) + minPriceChangeRate;
                        var product = new DataHolderClasses.Product.HBProduct
                        {
                            HepsiburadaSku = listingRow["HepsiburadaSku"].ToString(),
                            MerchantSku = listingRow["MerchantSku"].ToString(),
                            Price = alteredPrice,
                            AvailableStock = Convert.ToUInt16(listingRow["AvailableStock"]),
                            DispatchTime = Convert.ToInt16(listingRow["DispatchTime"]),
                            MaximumPurchasableQuantity = Convert.ToByte(listingRow["MaximumPurchasableQuantity"]),
                            CargoCompany1 = listingRow["CargoCompany1"].ToString(),
                            CargoCompany2 = listingRow["CargoCompany2"].ToString(),
                            CargoCompany3 = listingRow["CargoCompany3"].ToString()
                        };
                        var newPriceChange = new HbPriceChange
                        {
                            hbSku = listingRow["HepsiburadaSku"].ToString(),
                            currentUnitPrice = unitPrice,
                            beforeChangeSellingPrice = sellingPrice,
                            afterChangeSellingPrice = alteredPrice,
                            basketRatio = basketMultiplier,
                            commissionRate = commissionRate,
                            beforeChangeBuxboxPrice = buyboxSellerPrice,
                            beforeChangeInBuybox = inBuybox,
                            beforeChangeSecondSellerPrice = secondSellerPrice
                        };
                        Database.HepsiBuradaMySql.InsertHbPriceChanges(newPriceChange);
                        AddToPriceChangeList(product);
                    }
                }
                else
                {
                    // Price is not closeout.
                    var commissionChanged = hbPriceChange.commissionRate != commissionRate;
                    var unitPriceChanged = hbPriceChange.currentUnitPrice != unitPrice;
                    var basketRatioChanged = hbPriceChange.basketRatio != basketMultiplier;
                    var justGotBuybox = !hbPriceChange.beforeChangeInBuybox && inBuybox;
                    var justLostBuybox = hbPriceChange.beforeChangeInBuybox && !inBuybox;
                    bool secondSellerPriceChanged = false;
                    if (justGotBuybox)
                    {
                        secondSellerPriceChanged = hbPriceChange.beforeChangeBuxboxPrice != secondSellerPrice;
                    }
                    else if (justLostBuybox)
                    {
                        secondSellerPriceChanged = hbPriceChange.beforeChangeSecondSellerPrice != buyboxSellerPrice;
                    }
                    else
                    {
                        secondSellerPriceChanged = hbPriceChange.beforeChangeSecondSellerPrice != secondSellerPrice;
                    }
                    bool buyboxPriceChanged = false;
                    if (justGotBuybox)
                    {
                        buyboxPriceChanged = hbPriceChange.beforeChangeBuxboxPrice != secondSellerPrice;
                    }
                    else if (justLostBuybox)
                    {
                        buyboxPriceChanged = hbPriceChange.beforeChangeSecondSellerPrice != buyboxSellerPrice;
                    }
                    else
                    {
                        buyboxPriceChanged = hbPriceChange.beforeChangeBuxboxPrice != buyboxSellerPrice;
                    }
                    if (!justGotBuybox || buyboxPriceChanged || secondSellerPriceChanged || commissionChanged || unitPriceChanged || basketRatioChanged)
                    {
                        // Price is not optimum. Something is changed. We need to optimize.
                        if (inBuybox)
                        {
                            if (increasePrice && buyboxSellerPrice != -1)
                            {
                                // We are in buybox, need to increase price.
                                var increasedPrice = Database.HepsiBuradaMySql.GetHbChangedPrice(listingRow["hepsiburadaSku"].ToString(), GetPriceToAdd(inBuybox));
                                var product = new DataHolderClasses.Product.HBProduct
                                {
                                    HepsiburadaSku = listingRow["HepsiburadaSku"].ToString(),
                                    MerchantSku = listingRow["MerchantSku"].ToString(),
                                    Price = increasedPrice,
                                    AvailableStock = Convert.ToUInt16(listingRow["AvailableStock"]),
                                    DispatchTime = Convert.ToInt16(listingRow["DispatchTime"]),
                                    MaximumPurchasableQuantity = Convert.ToByte(listingRow["MaximumPurchasableQuantity"]),
                                    CargoCompany1 = listingRow["CargoCompany1"].ToString(),
                                    CargoCompany2 = listingRow["CargoCompany2"].ToString(),
                                    CargoCompany3 = listingRow["CargoCompany3"].ToString()
                                };
                                var newPriceChange = new HbPriceChange
                                {
                                    hbSku = listingRow["HepsiburadaSku"].ToString(),
                                    currentUnitPrice = unitPrice,
                                    beforeChangeSellingPrice = sellingPrice,
                                    afterChangeSellingPrice = increasedPrice,
                                    basketRatio = basketMultiplier,
                                    commissionRate = commissionRate,
                                    beforeChangeBuxboxPrice = buyboxSellerPrice,
                                    beforeChangeInBuybox = inBuybox,
                                    beforeChangeSecondSellerPrice = secondSellerPrice
                                };
                                Database.HepsiBuradaMySql.InsertHbPriceChanges(newPriceChange);
                                AddToPriceChangeList(product);
                            }
                        }
                        else
                        {
                            // We are not in buybox, need to decrease price.
                            if (decreasePrice && buyboxSellerPrice != -1)
                            {
                                var decreasedPrice = Database.HepsiBuradaMySql.GetHbChangedPrice(listingRow["hepsiburadaSku"].ToString(), GetPriceToAdd(inBuybox));
                                var product = new DataHolderClasses.Product.HBProduct
                                {
                                    HepsiburadaSku = listingRow["HepsiburadaSku"].ToString(),
                                    MerchantSku = listingRow["MerchantSku"].ToString(),
                                    Price = decreasedPrice,
                                    AvailableStock = Convert.ToUInt16(listingRow["AvailableStock"]),
                                    DispatchTime = Convert.ToInt16(listingRow["DispatchTime"]),
                                    MaximumPurchasableQuantity = Convert.ToByte(listingRow["MaximumPurchasableQuantity"]),
                                    CargoCompany1 = listingRow["CargoCompany1"].ToString(),
                                    CargoCompany2 = listingRow["CargoCompany2"].ToString(),
                                    CargoCompany3 = listingRow["CargoCompany3"].ToString()
                                };
                                var newPriceChange = new HbPriceChange
                                {
                                    hbSku = listingRow["HepsiburadaSku"].ToString(),
                                    currentUnitPrice = unitPrice,
                                    beforeChangeSellingPrice = sellingPrice,
                                    afterChangeSellingPrice = decreasedPrice,
                                    basketRatio = basketMultiplier,
                                    commissionRate = commissionRate,
                                    beforeChangeBuxboxPrice = buyboxSellerPrice,
                                    beforeChangeInBuybox = inBuybox,
                                    beforeChangeSecondSellerPrice = secondSellerPrice
                                };
                                Database.HepsiBuradaMySql.InsertHbPriceChanges(newPriceChange);
                                AddToPriceChangeList(product);
                            }
                        }
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HBAutoBB", "AutoChangePrice", exc);
            }
        }
        private static double GetPriceToAdd(bool inBuybox)
        {
            if (inBuybox)
            {
                return minPriceChangeRate;
            }
            else
            {
                return minPriceChangeRate * -1;
            }
        }
        private static void AddToPriceChangeList(DataHolderClasses.Product.HBProduct hbProduct)
        {
            int tokenCountToUpdate = priceChangeListCapacity;
            if (priceChangeList.Count == tokenCountToUpdate)
            {
                priceChangeList.Clear();
            }
            priceChangeList.Add(hbProduct);
            if (priceChangeList.Count == tokenCountToUpdate)
            {
                MarketPlaces.HepsiBurada.UpdateListings(priceChangeList);
                priceChangeList.Clear();
            }
        }
        internal static void CommitChangesAndClearList()
        {
            if (!settingsImported) ImportSettings();
            if (priceChangeList.Count != 0)
            {
                MarketPlaces.HepsiBurada.UpdateListings(priceChangeList);
                priceChangeList.Clear();
            }
        }
        private static double GetPriceWithoutExpenditure(double sellingPrice, double commissionRate, double basketDiscountRatio, double storeDebtAmount)
        {
            try
            {
                var finalPrice = sellingPrice * basketDiscountRatio;
                var totalBasketAmount = sellingPrice * (1 - basketDiscountRatio);
                var storeBasketAmount = totalBasketAmount * (storeDebtAmount / 100);
                var hbBasketAmount = totalBasketAmount - storeBasketAmount;
                var listingPrice = sellingPrice - storeBasketAmount;
                var cargoPrice = GetCargoPrice(finalPrice);
                var otherExpenses = finalPrice >= marketingExpenditureLimit ? marketingExpenditure : 0;
                var commissionAmount = listingPrice * (commissionRate / 100);
                var priceWithoutExpenses = finalPrice - commissionAmount - cargoPrice + hbBasketAmount - otherExpenses;
                return priceWithoutExpenses;
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HBAutoBB", "GetPriceWithoutExpense", exc);
                return -1;
            }
        }
        private static double GetLowestSellablePrice(double unitPrice, double commissionRate, double basketDiscountRatio, double storeDebtAmount)
        {
            try
            {
                var commissionMultiplier = 1 - (commissionRate / 100);
                var maxUnitPrice = GetPriceWithoutExpenditure(99.99 / basketDiscountRatio, commissionRate, basketDiscountRatio, storeDebtAmount);
                var basketDiscountMultiplier = 1 - basketDiscountRatio;
                var storeBasketMultiplier = 1 - (storeDebtAmount / 100 * basketDiscountMultiplier);
                if (unitPrice <= maxUnitPrice)
                {
                    maxUnitPrice = GetPriceWithoutExpenditure(49.99 / basketDiscountRatio, commissionRate, basketDiscountRatio, storeDebtAmount);
                    if (unitPrice <= maxUnitPrice)
                    {
                        maxUnitPrice = GetPriceWithoutExpenditure(29.99 / basketDiscountRatio, commissionRate, basketDiscountRatio, storeDebtAmount);
                        if (unitPrice <= maxUnitPrice)
                        {
                            return (unitPrice + firstCargoPrice) / commissionMultiplier / storeBasketMultiplier;
                        }
                        else
                        {
                            return (unitPrice + secondCargoPrice) / commissionMultiplier / storeBasketMultiplier;
                        }
                    }
                    else
                    {
                        return (unitPrice + secondCargoPrice + marketingExpenditure) / commissionMultiplier / storeBasketMultiplier;
                    }
                }
                else
                {
                    return (unitPrice + thirdCargoPrice + marketingExpenditure) / commissionMultiplier / storeBasketMultiplier;
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HBAutoBB", "GetPriceWithoutExpense", exc);
                return -1;
            }
        }
        private static double GetCargoPrice(double finalPrice)
        {
            if (finalPrice >= 100)
            {
                return thirdCargoPrice;
            }
            else if (finalPrice >= 30)
            {
                return secondCargoPrice;
            }
            else
            {
                return firstCargoPrice;
            }
        }
        private static short GetCurrentBuyboxOrder(JToken buyboxOrderToken)
        {
            try
            {
                if (!settingsImported) ImportSettings();
                short counter = 1;
                foreach (var sellerToken in buyboxOrderToken["buyboxOrders"].Children())
                {
                    var merchantName = sellerToken["merchantName"].ToString();
                    if (merchantName == storeName)
                    {
                        return counter;
                    }
                    counter++;
                }
                return -1;
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("HBAutoBB", "GetCurrentBuyboxOrder", exc, barcode: buyboxOrderToken["merchantSku"].ToString());
                return -1;
            }
        }
        private static JToken GetSellerAtIndex(JToken buyboxOrderToken, short index)
        {
            int counter = 1;
            foreach (var sellerToken in buyboxOrderToken["buyboxOrders"])
            {
                if (counter == index)
                {
                    return sellerToken;
                }
                else
                {
                    counter++;
                }
            }
            return null;

        }
        private static void ImportSettings()
        {
            // TODO : Get from settings file.
            storeName = "FARMAUCUZ";
            firstCargoPrice = 4.71;
            secondCargoPrice = 9.43;
            thirdCargoPrice = 12.08;
            marketingExpenditure = 1.18;
            marketingExpenditureLimit = 50;
            priceChangeList = new List<DataHolderClasses.Product.HBProduct>();
            minPriceChangeRate = 0.2;
            commissionRateVat = 1.18;
            priceChangeListCapacity = 5;


            settingsImported = true;
        }
    }
}
