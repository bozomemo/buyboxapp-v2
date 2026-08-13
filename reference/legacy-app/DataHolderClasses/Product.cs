using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BuyBoxApp.DataHolderClasses
{
    public class Product
    {
        public struct GGProduct
        {
            // TODO : Fill this.
            public string StockCode { get; set; }
            public string Title { get; set; }
            public string SubTitle { get; set; }
            public string BrandName { get; set; }
            public int BrandId { get; set; }
            public string CategoryName { get; set; }
            public string CategoryCode { get; set; }
            public int storeCategoryId { get; set; }
            public List<string> Photos { get; set; }
            public Dictionary<string, string> Specs { get; set; }
            public short PageTemplate { get; set; }
            public string Description { get; set; }
            public short CatalogId { get; set; }
            public string CatalogDetail { get; set; }
            public string Format { get; set; }
        }
        public struct HBProduct
        {
            public string HepsiburadaSku { get; set; }
            public string MerchantSku { get; set; }
            public double Price { get; set; }
            public ushort AvailableStock { get; set; }
            public short DispatchTime { get; set; }
            public string CargoCompany1 { get; set; }
            public string CargoCompany2 { get; set; }
            public string CargoCompany3 { get; set; }
            public string ShippingAddressLabel { get; set; }
            public string ClaimAddressLabel { get; set; }
            public byte MaximumPurchasableQuantity { get; set; }
            public byte MinimumPurchasableQuantity { get; set; }
            public bool IsSalable { get; set; }
            public string DeactivationReasons { get; set; }
            public bool IsSuspended { get; set; }
            public bool IsLocked { get; set; }
            public string LockReasons { get; set; }
            public bool IsFrozen { get; set; }
            public double CommissionRate { get; set; }
            public short BuyboxOrder { get; set; }
            public bool IsFulfilledByHB { get; set; }

        }
        public struct MarketplaceOrder
        {
            public ulong orderId { get; set; }
            public string orderMarketplaceCode { get; set; }
            public int orderPackageId { get; set; }
            public string orderMarketplace { get; set; }
            public DateTime orderDate { get; set; }
            public short orderStateId { get; set; }
            public string orderState { get; set; }
            public string orderReferenceNo { get; set; }
            public double orderGrossPrice { get; set; }
            public double orderTotalDiscount { get; set; }
            public double orderTotalPrice { get; set; }
            public string shipmentCompany { get; set; }
            public string shipmentCargoCode { get; set; }
            public string buyerId { get; set; }
            public string buyerUsername { get; set; }
            public string buyerDeliveryName { get; set; }
            public string buyerDeliveryAddress { get; set; }
            public string buyerDeliveryEmail { get; set; }
            public string buyerDeliveryPhone { get; set; }
            public string buyerDeliveryDistrict { get; set; }
            public string buyerDeliveryTown { get; set; }
            public string buyerDeliveryCity { get; set; }
            public string buyerInvoiceName { get; set; }
            public string buyerInvoicePhone { get; set; }
            public string buyerInvoiceEmail { get; set; }
            public string buyerInvoiceTaxOrTcNo { get; set; }
            public string buyerInvoiceTaxOffice { get; set; }
            public string buyerInvoiceAddress { get; set; }
            public string buyerInvoiceDistrict { get; set; }
            public string buyerInvoiceTown { get; set; }
            public string buyerInvoiceCity { get; set; }
        }
        public struct MarketplaceOrderProduct
        {
            public ulong orderId { get; set; }
            public string productBarcode { get; set; }
            public string productStockCode { get; set; }
            public string orderMarketplaceCode { get; set; }
            public string productName { get; set; }
            public short quantity { get; set; }
            public double unitPrice { get; set; }
            public double totalPrice { get; set; }
            public double unitDiscountPrice { get; set; }
            public double totalDiscountPrice { get; set; }
            public double vat { get; set; }
            public double commissionRate { get; set; }
            public double debtorDifferenceAmount { get; set; }
        }
    }
}
