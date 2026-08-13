-- MySQL dump 10.13  Distrib 8.0.19, for Win64 (x86_64)
--
-- Host: localhost    Database: buyboxapp
-- ------------------------------------------------------
-- Server version	8.3.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `bundle_table`
--

DROP TABLE IF EXISTS `bundle_table`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bundle_table` (
  `Bundle_Stock_Code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `Bundle_Unit_Stock_Code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `Bundle_Unit_Product_Name` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  KEY `StockCode` (`Bundle_Stock_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bundle_table`
--

LOCK TABLES `bundle_table` WRITE;
/*!40000 ALTER TABLE `bundle_table` DISABLE KEYS */;
/*!40000 ALTER TABLE `bundle_table` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bundletablev2`
--

DROP TABLE IF EXISTS `bundletablev2`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bundletablev2` (
  `BundleStockCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci NOT NULL,
  `BundleUnitStockCodes` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL COMMENT 'Urun stok kodu.',
  `BundleUnitProductNames` varchar(2000) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  PRIMARY KEY (`BundleStockCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci COMMENT='Paket ürün ve içeriklerinin tutulduğu tablo';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bundletablev2`
--

LOCK TABLES `bundletablev2` WRITE;
/*!40000 ALTER TABLE `bundletablev2` DISABLE KEYS */;
/*!40000 ALTER TABLE `bundletablev2` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `farmazon_listings`
--

DROP TABLE IF EXISTS `farmazon_listings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `farmazon_listings` (
  `id` int NOT NULL DEFAULT '-1',
  `price` double DEFAULT NULL,
  `buyingPrice` double DEFAULT NULL,
  `stock` int DEFAULT NULL,
  `maxCount` int DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `expiration` datetime DEFAULT NULL,
  `isFeatured` tinyint DEFAULT NULL,
  `isBestPrice` tinyint DEFAULT NULL,
  `active` tinyint DEFAULT NULL,
  `product_id` int DEFAULT NULL,
  `product_name` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `product_vat` smallint DEFAULT NULL,
  `product_listingMinPrice` double DEFAULT NULL,
  `product_barcode1` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `product_barcode2` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `product_barcode3` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `product_barcode4` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `LastUpdateDate` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Listings from api service of farmazon marketplace.';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `farmazon_listings`
--

LOCK TABLES `farmazon_listings` WRITE;
/*!40000 ALTER TABLE `farmazon_listings` DISABLE KEYS */;
/*!40000 ALTER TABLE `farmazon_listings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ggcategories`
--

DROP TABLE IF EXISTS `ggcategories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ggcategories` (
  `CategoryCode` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ParentCategoryCode` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `CategoryName` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `HasCatalog` bit(2) DEFAULT NULL,
  `Deepest` bit(2) DEFAULT NULL,
  `ShippingTimes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'Multiple values seperated by ''|''',
  PRIMARY KEY (`CategoryCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='GittiGidiyor bütün kategoriler';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ggcategories`
--

LOCK TABLES `ggcategories` WRITE;
/*!40000 ALTER TABLE `ggcategories` DISABLE KEYS */;
/*!40000 ALTER TABLE `ggcategories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ggcategoryspecs`
--

DROP TABLE IF EXISTS `ggcategoryspecs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ggcategoryspecs` (
  `GGCategoryCode` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `SpecType` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `SpecRequired` bit(2) DEFAULT NULL,
  `SpecName` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `SpecValues` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='GittiGidiyor kategorilerinin özellikleri';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ggcategoryspecs`
--

LOCK TABLES `ggcategoryspecs` WRITE;
/*!40000 ALTER TABLE `ggcategoryspecs` DISABLE KEYS */;
/*!40000 ALTER TABLE `ggcategoryspecs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `hb_category_administrators`
--

DROP TABLE IF EXISTS `hb_category_administrators`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hb_category_administrators` (
  `CategoryId` int NOT NULL AUTO_INCREMENT,
  `Name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `Categories` varchar(4000) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL COMMENT 'Categories joined by "|" character.',
  PRIMARY KEY (`CategoryId`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `hb_category_administrators`
--

LOCK TABLES `hb_category_administrators` WRITE;
/*!40000 ALTER TABLE `hb_category_administrators` DISABLE KEYS */;
/*!40000 ALTER TABLE `hb_category_administrators` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `hb_price_changes`
--

DROP TABLE IF EXISTS `hb_price_changes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hb_price_changes` (
  `hb_sku` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `before_change` float DEFAULT NULL COMMENT 'Fiyat değişiminin tutulduğu sütun.',
  `after_change` float DEFAULT NULL,
  `buybox_rank` int DEFAULT NULL,
  `commission` float DEFAULT NULL,
  `buybox_price` float DEFAULT NULL,
  `second_seller_price` float DEFAULT NULL,
  `last_price_change_rate` float DEFAULT NULL,
  `price_change_comment` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Fiyat değişimine dair bilgi',
  `request_process_id` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_change_time` datetime DEFAULT NULL,
  PRIMARY KEY (`hb_sku`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci COMMENT='Hepsiburada fiyat değişimlerinin tutulduğu tablo.';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `hb_price_changes`
--

LOCK TABLES `hb_price_changes` WRITE;
/*!40000 ALTER TABLE `hb_price_changes` DISABLE KEYS */;
/*!40000 ALTER TABLE `hb_price_changes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `hbbuyboxorders`
--

DROP TABLE IF EXISTS `hbbuyboxorders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hbbuyboxorders` (
  `Sku` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci NOT NULL,
  `BuyboxOrders` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci,
  `LastUpdateDate` datetime DEFAULT NULL,
  PRIMARY KEY (`Sku`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci COMMENT='Hepsi burada buybox sırası';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `hbbuyboxorders`
--

LOCK TABLES `hbbuyboxorders` WRITE;
/*!40000 ALTER TABLE `hbbuyboxorders` DISABLE KEYS */;
/*!40000 ALTER TABLE `hbbuyboxorders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `hblistingpricings`
--

DROP TABLE IF EXISTS `hblistingpricings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hblistingpricings` (
  `HepsiburadaSku` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci NOT NULL,
  `FinalPrice` double DEFAULT NULL,
  `StartDate` datetime DEFAULT NULL,
  `EndDate` datetime DEFAULT NULL,
  `StoreDebtAmount` double DEFAULT NULL,
  `HepsiBuradaDebtAmount` double DEFAULT NULL,
  PRIMARY KEY (`HepsiburadaSku`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci COMMENT='HepsiBurada Kampanyalı ürünlerin ayrıntıları';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `hblistingpricings`
--

LOCK TABLES `hblistingpricings` WRITE;
/*!40000 ALTER TABLE `hblistingpricings` DISABLE KEYS */;
/*!40000 ALTER TABLE `hblistingpricings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `hblistings`
--

DROP TABLE IF EXISTS `hblistings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hblistings` (
  `HepsiburadaSku` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci NOT NULL,
  `Brand` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `Category` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `ProductName` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `MerchantSku` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `Price` double DEFAULT NULL,
  `AvailableStock` smallint DEFAULT NULL,
  `DispatchTime` smallint DEFAULT NULL,
  `CargoCompany1` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `CargoCompany2` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `CargoCompany3` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `ShippingAddressLabel` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `ClaimAddressLabel` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `MaximumPurchasableQuantity` tinyint unsigned DEFAULT NULL,
  `MinimumPurchasableQuantity` tinyint unsigned DEFAULT NULL,
  `IsSalable` tinyint unsigned DEFAULT NULL,
  `DeactivationReasons` text CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci,
  `IsSuspended` tinyint DEFAULT NULL,
  `IsLocked` tinyint DEFAULT NULL,
  `LockReasons` text CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci,
  `IsFrozen` tinyint DEFAULT NULL,
  `CommissionRate` double DEFAULT NULL,
  `IsFulfilledByHB` tinyint unsigned DEFAULT NULL,
  `HasPricing` tinyint unsigned DEFAULT NULL,
  `IncreasePrice` bit(1) DEFAULT NULL,
  `DecreasePrice` bit(1) DEFAULT NULL,
  `ExitBuybox` tinyint DEFAULT '0',
  `MinimumPrice` float DEFAULT NULL COMMENT 'Minimum value that autoprice application can set.',
  `MaximumPrice` float DEFAULT NULL COMMENT 'Maximum value that autoprice application can set.',
  `CampaignCommissionRate` float DEFAULT NULL,
  `CampaignCommissionStartDate` datetime DEFAULT NULL,
  `CampaignCommissionEndDate` datetime DEFAULT NULL,
  `LastUpdateDate` datetime DEFAULT NULL,
  PRIMARY KEY (`HepsiburadaSku`) USING BTREE,
  KEY `MerchangSkuIndex` (`MerchantSku`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci COMMENT='HepsiBuradadaki ürünler';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `hblistings`
--

LOCK TABLES `hblistings` WRITE;
/*!40000 ALTER TABLE `hblistings` DISABLE KEYS */;
/*!40000 ALTER TABLE `hblistings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `hbpricechanges`
--

DROP TABLE IF EXISTS `hbpricechanges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hbpricechanges` (
  `HepsiburadaSku` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `CurrentUnitPrice` double DEFAULT NULL,
  `BeforeChangeSellingPrice` double DEFAULT NULL,
  `AfterChangeSellingPrice` double DEFAULT NULL,
  `BasketRatio` double DEFAULT NULL,
  `CommissionRate` double DEFAULT NULL,
  `BeforeChangeBuyboxPrice` double DEFAULT NULL,
  `BeforeChangeSecondSellerPrice` double DEFAULT NULL,
  `BeforeChangeInBuybox` bit(1) DEFAULT NULL,
  `LastChangeTime` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci COMMENT='Table that keeps price change information';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `hbpricechanges`
--

LOCK TABLES `hbpricechanges` WRITE;
/*!40000 ALTER TABLE `hbpricechanges` DISABLE KEYS */;
/*!40000 ALTER TABLE `hbpricechanges` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `log_table`
--

DROP TABLE IF EXISTS `log_table`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `log_table` (
  `Class_Name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Name of class that exception has thrown',
  `Method_Name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Exception_Type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Type of exception that has thrown',
  `Exception_Message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `Inner_Exception_Type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Type of inner exception',
  `Inner_Exception_Message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `Thrown_Time` datetime DEFAULT NULL,
  `Stock_Code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Barcode` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  KEY `BarcodeIndex` (`Barcode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='The table where buyboxapp exceptions are hold.';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `log_table`
--

LOCK TABLES `log_table` WRITE;
/*!40000 ALTER TABLE `log_table` DISABLE KEYS */;
/*!40000 ALTER TABLE `log_table` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `marketplace_orders`
--

DROP TABLE IF EXISTS `marketplace_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketplace_orders` (
  `OrderId` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci NOT NULL,
  `Status` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `OrderDate` datetime DEFAULT NULL,
  `DueDate` datetime DEFAULT NULL,
  `Barcode` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `PackageNumber` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `OrderNumber` varchar(25) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `CargoCompany` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `ShippingAddressDetail` text CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci,
  `RecipientName` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `ShippingCountryCode` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `ShippingDistrict` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `ShippingTown` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `ShippingCity` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `Email` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `PhoneNumber` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `CompanyName` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `BillingAddress` text CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci,
  `BillingCity` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `BillingTown` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `BillingDistrict` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `BillingPostalCode` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `TaxOffice` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `TaxNumber` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `IdentityNo` varchar(11) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `TotalPrice` float DEFAULT NULL,
  `IsCargoChangable` tinyint DEFAULT NULL,
  `CustomerName` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `MarketPlace` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  PRIMARY KEY (`OrderId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci COMMENT='			';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `marketplace_orders`
--

LOCK TABLES `marketplace_orders` WRITE;
/*!40000 ALTER TABLE `marketplace_orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `marketplace_orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `marketplace_orders_old`
--

DROP TABLE IF EXISTS `marketplace_orders_old`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketplace_orders_old` (
  `orderId` bigint NOT NULL COMMENT 'Sipariş Numarası',
  `orderMarketplaceCode` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Sipariş Pazaryeri Kodu',
  `orderPackageId` int DEFAULT NULL COMMENT 'Sipariş Paket Numarası',
  `orderMarketplace` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Sipariş Pazaryeri',
  `orderDate` datetime DEFAULT NULL COMMENT 'Sipariş Tarihi',
  `orderStateId` tinyint DEFAULT NULL COMMENT 'Sipariş Durum Kodu',
  `orderState` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Sipariş Durumu',
  `orderReferenceNo` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Sipariş Referans Numarası',
  `orderGrossPrice` double DEFAULT NULL COMMENT 'Sipariş Brüt Tutarı',
  `orderTotalDiscount` double DEFAULT NULL COMMENT 'Sipariş İndirim Tutarı',
  `orderTotalPrice` double DEFAULT NULL COMMENT 'Sipariş Net Tutarı',
  `shipmentCompany` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Kargo Firması',
  `shipmentCargoCode` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Kargo Kodu',
  `buyerId` mediumint DEFAULT NULL COMMENT 'Alıcı Numarası',
  `buyerUsername` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Alıcı Kullanıcı Adı',
  `buyerFullName` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Alıcı Tam İsim',
  `buyerInvoiceCompanyName` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Fatura Firma Adı',
  `buyerInvoicePhone` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Fatura Telefon Numarası',
  `buyerInvoiceEmail` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Fatura E-Mail',
  `buyerInvoiceTaxOrTcNo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Fatura Vergi Numarası/TC Kimlik Numarası',
  `buyerInvoiceTaxOffice` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Fatura Vergi Dairesi',
  `buyerInvoiceAddress` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'Fatura Tam Adresi',
  `buyerInvoiceTown` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Fatura Adres İlçe',
  `buyerInvoiceCity` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Fatura Adres İl',
  `buyerDeliveryTown` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Alıcı Teslimat İli',
  `buyerDeliveryCity` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Alıcı Teslimat İlçe',
  `lastUpdateDate` datetime DEFAULT NULL COMMENT 'Sipariş Çekilme Zamanı',
  PRIMARY KEY (`orderId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `marketplace_orders_old`
--

LOCK TABLES `marketplace_orders_old` WRITE;
/*!40000 ALTER TABLE `marketplace_orders_old` DISABLE KEYS */;
/*!40000 ALTER TABLE `marketplace_orders_old` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `marketplaceorderproductspendingapproval`
--

DROP TABLE IF EXISTS `marketplaceorderproductspendingapproval`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketplaceorderproductspendingapproval` (
  `orderId` bigint DEFAULT NULL COMMENT 'Sipariş Numarası',
  `productBarcode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Ürün Pazaryeri Barkodu',
  `productStockCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Ürün Stok Kodu',
  `orderMarketplaceCode` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Sipariş Pazaryeri Kodu',
  `productName` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Ürün Adı',
  `quantity` tinyint DEFAULT NULL COMMENT 'Siparişteki Ürün Adedi',
  `unitPrice` double DEFAULT NULL COMMENT 'Adet Tutarı',
  `totalPrice` double DEFAULT NULL COMMENT 'Toplam Tutar',
  `unitDiscountPrice` double DEFAULT NULL COMMENT 'Adet İndirim Tutarı',
  `totalDiscountPrice` double DEFAULT NULL COMMENT 'Toplam İndirim Tutarı',
  `vat` double DEFAULT NULL COMMENT 'Kdv Oranı',
  `commissionRate` double DEFAULT NULL COMMENT 'Komisyon Oranı',
  `currentProductUnitPrice` double DEFAULT NULL COMMENT 'Anlık Ürün Birim Fiyatı',
  `currentPriceWithoutExpenses` double DEFAULT NULL COMMENT 'Anlık Hesaba Geçen Miktar',
  `profit` double DEFAULT NULL COMMENT 'Üründen elde edilen kâr',
  `lastUpdateDate` datetime DEFAULT NULL COMMENT 'Son Güncelleme Tarihi'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pazaryerlerindeki onay bekleyen siparişlerdeki ürünler.';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `marketplaceorderproductspendingapproval`
--

LOCK TABLES `marketplaceorderproductspendingapproval` WRITE;
/*!40000 ALTER TABLE `marketplaceorderproductspendingapproval` DISABLE KEYS */;
/*!40000 ALTER TABLE `marketplaceorderproductspendingapproval` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `marketplaceorderspendingapproval`
--

DROP TABLE IF EXISTS `marketplaceorderspendingapproval`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketplaceorderspendingapproval` (
  `orderId` bigint DEFAULT NULL COMMENT 'Sipariş Numarası',
  `orderMarketplaceCode` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Sipariş Pazaryeri Kodu',
  `orderPackageId` int DEFAULT NULL COMMENT 'Sipariş Paket Numarası',
  `orderMarketplace` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Sipariş Pazaryeri',
  `orderDate` datetime DEFAULT NULL COMMENT 'Sipariş Tarihi',
  `orderStateId` tinyint DEFAULT NULL COMMENT 'Sipariş Durum Kodu',
  `orderState` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Sipariş Durumu',
  `orderReferenceNo` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Sipariş Referans Numarası',
  `orderGrossPrice` double DEFAULT NULL COMMENT 'Sipariş Brüt Tutarı',
  `orderTotalDiscount` double DEFAULT NULL COMMENT 'Sipariş İndirim Tutarı',
  `orderTotalPrice` double DEFAULT NULL COMMENT 'Sipariş Net Tutarı',
  `shipmentCompany` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Kargo Firması',
  `shipmentCargoCode` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Kargo Kodu',
  `buyerId` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Alıcı Id Numarası',
  `buyerUsername` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Alıcı Kullanıcı Adı',
  `buyerDeliveryName` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Teslimat Alıcı Adı',
  `buyerDeliveryAddress` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'Teslimat Alıcı Adresi',
  `buyerDeliveryEmail` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Teslimat Alıcı E-Mail',
  `buyerDeliveryPhone` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Teslimat Alıcı Telefon Numarası',
  `buyerDeliveryDistrict` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Teslimat Alıcı Mahalle',
  `buyerDeliveryTown` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Teslimat Alıcı İli',
  `buyerDeliveryCity` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Teslimat Alıcı İlçe',
  `buyerInvoiceName` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Fatura Alıcı Adı',
  `buyerInvoicePhone` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Fatura Telefon Numarası',
  `buyerInvoiceEmail` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Fatura E-Mail',
  `buyerInvoiceTaxOrTcNo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Fatura Vergi Numarası/TC Kimlik Numarası',
  `buyerInvoiceTaxOffice` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Fatura Vergi Dairesi',
  `buyerInvoiceAddress` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'Fatura Tam Adresi',
  `buyerInvoiceDistrict` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Fatura Adres Mahalle',
  `buyerInvoiceTown` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Fatura Adres İlçe',
  `buyerInvoiceCity` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Fatura Adres İl',
  `lastUpdateDate` datetime DEFAULT NULL COMMENT 'Sipariş Çekilme Zamanı'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `marketplaceorderspendingapproval`
--

LOCK TABLES `marketplaceorderspendingapproval` WRITE;
/*!40000 ALTER TABLE `marketplaceorderspendingapproval` DISABLE KEYS */;
/*!40000 ALTER TABLE `marketplaceorderspendingapproval` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `marketplacesettings`
--

DROP TABLE IF EXISTS `marketplacesettings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketplacesettings` (
  `MarketPlaceCode` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci NOT NULL,
  `MarketPlaceFullName` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `MarketPlaceStoreName` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `AutoBbActive` bit(1) DEFAULT NULL,
  `AutoStockActive` bit(1) DEFAULT NULL,
  `CargoPrice1` double DEFAULT NULL,
  `CargoPriceThreshold1` double DEFAULT NULL,
  `CargoPrice2` double DEFAULT NULL,
  `CargoPriceThreshold2` double DEFAULT NULL,
  `CargoPrice3` double DEFAULT NULL,
  `CargoPriceThreshold3` double DEFAULT NULL,
  `CargoPrice4` double DEFAULT NULL,
  `CargoPriceThreshold4` double DEFAULT NULL,
  `CargoPrice5` double DEFAULT NULL,
  `CargoPriceThreshold5` double DEFAULT NULL,
  `Expenditure1` double DEFAULT NULL,
  `ExpenditureThreshold1` double DEFAULT NULL,
  `Expenditure2` double DEFAULT NULL,
  `ExpenditureThreshold2` double DEFAULT NULL,
  `Expenditure3` double DEFAULT NULL,
  `ExpenditureThreshold3` double DEFAULT NULL,
  `Expenditure4` double DEFAULT NULL,
  `ExpenditureThreshold4` double DEFAULT NULL,
  `Expenditure5` double DEFAULT NULL,
  `ExpenditureThreshold5` double DEFAULT NULL,
  `CommissionRateVat` double DEFAULT NULL,
  `PriceChangeRate` double DEFAULT NULL,
  `Password` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `MerchantId` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `PagingLimit` int DEFAULT NULL,
  `StoreUserName` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `AutoListingInterval` int DEFAULT NULL,
  `SuggestedStockMultiplier` int DEFAULT NULL,
  `BuyboxPriceRange` float DEFAULT NULL,
  `OnlySellerProfitPercentage` float DEFAULT NULL,
  PRIMARY KEY (`MarketPlaceCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci COMMENT='Table that holds user defined marketplace settings ';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `marketplacesettings`
--

LOCK TABLES `marketplacesettings` WRITE;
/*!40000 ALTER TABLE `marketplacesettings` DISABLE KEYS */;
/*!40000 ALTER TABLE `marketplacesettings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `order_products`
--

DROP TABLE IF EXISTS `order_products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `order_products` (
  `PackageId` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci NOT NULL,
  `OrderNumber` varchar(25) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci NOT NULL,
  `ProductCardId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `StockCode` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `CargoPaymentInfo` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `ProductName` text CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci,
  `Commission` float DEFAULT NULL,
  `DueDate` datetime DEFAULT NULL,
  `OrderDate` datetime DEFAULT NULL,
  `DeliveryType` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `Gtip` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `ProductBarcode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `Quantity` int DEFAULT NULL,
  `UnitPrice` float DEFAULT NULL,
  `CargoPrice` float DEFAULT NULL,
  `Expenditure` float DEFAULT NULL,
  `Price` float DEFAULT NULL,
  `TotalPrice` float DEFAULT NULL,
  `CommissionRate` float DEFAULT NULL,
  `TotalDiscount` float DEFAULT NULL,
  `Vat` float DEFAULT NULL,
  `VatRate` int DEFAULT NULL,
  `DiscountToBeBilled` float DEFAULT NULL,
  `Marketplace` varchar(25) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  PRIMARY KEY (`PackageId`,`OrderNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_products`
--

LOCK TABLES `order_products` WRITE;
/*!40000 ALTER TABLE `order_products` DISABLE KEYS */;
/*!40000 ALTER TABLE `order_products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary view structure for view `order_products_view`
--

DROP TABLE IF EXISTS `order_products_view`;
/*!50001 DROP VIEW IF EXISTS `order_products_view`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `order_products_view` AS SELECT 
 1 AS `ProductCardId`,
 1 AS `OrderNumber`,
 1 AS `StockCode`,
 1 AS `CargoPaymentInfo`,
 1 AS `ProductName`,
 1 AS `Commission`,
 1 AS `DueDate`,
 1 AS `OrderDate`,
 1 AS `DeliveryType`,
 1 AS `Gtip`,
 1 AS `ProductBarcode`,
 1 AS `Quantity`,
 1 AS `UnitPrice`,
 1 AS `CargoPrice`,
 1 AS `Expenditure`,
 1 AS `Price`,
 1 AS `TotalPrice`,
 1 AS `CommissionRate`,
 1 AS `TotalDiscount`,
 1 AS `Vat`,
 1 AS `VatRate`,
 1 AS `DiscountToBeBilled`,
 1 AS `Marketplace`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `orders_deneme`
--

DROP TABLE IF EXISTS `orders_deneme`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders_deneme` (
  `orderId` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci NOT NULL,
  `orderData` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  PRIMARY KEY (`orderId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders_deneme`
--

LOCK TABLES `orders_deneme` WRITE;
/*!40000 ALTER TABLE `orders_deneme` DISABLE KEYS */;
/*!40000 ALTER TABLE `orders_deneme` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `secret_stock`
--

DROP TABLE IF EXISTS `secret_stock`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `secret_stock` (
  `stockcode` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci NOT NULL,
  `stock_to_set` int DEFAULT NULL,
  `time_interval` int DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`stockcode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `secret_stock`
--

LOCK TABLES `secret_stock` WRITE;
/*!40000 ALTER TABLE `secret_stock` DISABLE KEYS */;
/*!40000 ALTER TABLE `secret_stock` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `stock_table`
--

DROP TABLE IF EXISTS `stock_table`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_table` (
  `Stock_Code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci NOT NULL,
  `Product_Name` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci DEFAULT NULL,
  `Unit_Price` double DEFAULT NULL,
  `Unit_Stock` int DEFAULT NULL,
  `Total_Selling_Stock` int DEFAULT NULL,
  `Special_Price_Multiplier` double DEFAULT NULL,
  `HbSpecialPriceMultiplier` double DEFAULT NULL,
  `Automated_Buybox` tinyint(1) DEFAULT NULL,
  `HbAutomatedBuybox` bit(1) DEFAULT NULL,
  `HbProductCardCount` int DEFAULT NULL,
  PRIMARY KEY (`Stock_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `stock_table`
--

LOCK TABLES `stock_table` WRITE;
/*!40000 ALTER TABLE `stock_table` DISABLE KEYS */;
/*!40000 ALTER TABLE `stock_table` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `trace_optimum_price`
--

DROP TABLE IF EXISTS `trace_optimum_price`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `trace_optimum_price` (
  `Barcode` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Current_Unit_Price` double DEFAULT NULL,
  `Before_Change_Selling_Price` double DEFAULT NULL,
  `After_Change_Selling_Price` double DEFAULT NULL,
  `Before_Change_In_Buybox` tinyint DEFAULT NULL,
  `Before_Change_Buybox_Price` double DEFAULT NULL,
  `Before_Change_Buybox_Promotions` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Second_Seller_Price` double DEFAULT NULL,
  `Second_Seller_Promotions` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `BeforeChangeCommissionRate` double DEFAULT NULL,
  `Last_Change_Time` datetime(3) DEFAULT NULL,
  KEY `BarcodeIndex` (`Barcode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `trace_optimum_price`
--

LOCK TABLES `trace_optimum_price` WRITE;
/*!40000 ALTER TABLE `trace_optimum_price` DISABLE KEYS */;
/*!40000 ALTER TABLE `trace_optimum_price` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `trendyol_product_cards`
--

DROP TABLE IF EXISTS `trendyol_product_cards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `trendyol_product_cards` (
  `Brand` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Category` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Barcode` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Product_Card_Name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Product_Card_Unit_Price` double DEFAULT NULL,
  `Original_Unit_Price` double DEFAULT NULL,
  `Model_Code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Seller_Stock_Code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `List_Price` double DEFAULT NULL,
  `Commission` double DEFAULT NULL,
  `Trendyol_Selling_Price` double DEFAULT NULL,
  `ProfitPercentage` float DEFAULT NULL,
  `Buybox_Profit_Percentage` double DEFAULT '1',
  `Lowest_Sellable_Price` double DEFAULT NULL,
  `Selling_Stock` int DEFAULT NULL,
  `Unit_Total_Stock` int DEFAULT NULL,
  `BuyBox_Seller_Name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `BuyBox_Seller_Price` double DEFAULT NULL,
  `Second_Seller_Name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Second_Seller_Price` double DEFAULT NULL,
  `Third_Seller_Name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Third_Seller_Price` double DEFAULT NULL,
  `Fourth_Seller_Name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Fourth_Seller_Price` double DEFAULT NULL,
  `Fifth_Seller_Name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Fifth_Seller_Price` double DEFAULT NULL,
  `Product_Comment_Count` int DEFAULT NULL,
  `Product_Rating_Count` int DEFAULT NULL,
  `BuyBox_Price_Difference` double DEFAULT NULL,
  `Second_Seller_Price_Difference` double DEFAULT NULL,
  `Average_Selling_Price` double DEFAULT NULL,
  `On_Sale` tinyint DEFAULT NULL,
  `In_BuyBox` tinyint DEFAULT NULL,
  `Under_Lowest_Sellable_Price` tinyint DEFAULT NULL,
  `Stock_Out` tinyint DEFAULT NULL,
  `Main_Product_Card` tinyint DEFAULT NULL,
  `Blacklisted` tinyint DEFAULT NULL,
  `Rejected` tinyint DEFAULT NULL,
  `Locked` tinyint DEFAULT NULL,
  `Auto_BB` tinyint DEFAULT NULL,
  `Increase_Price` tinyint DEFAULT NULL,
  `Decrease_Price` tinyint DEFAULT NULL,
  `Enter_Buybox` tinyint DEFAULT '0',
  `Exit_Buybox` tinyint DEFAULT '0',
  `Product_Content_Id` int DEFAULT NULL,
  `Last_Update_Date` datetime(3) DEFAULT NULL,
  `Product_Json_Text` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `Buybox_Seller_Json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `Other_Sellers_Json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`Barcode`),
  KEY `StockCode` (`Seller_Stock_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `trendyol_product_cards`
--

LOCK TABLES `trendyol_product_cards` WRITE;
/*!40000 ALTER TABLE `trendyol_product_cards` DISABLE KEYS */;
/*!40000 ALTER TABLE `trendyol_product_cards` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trendyol_product_cards_update_profits` BEFORE INSERT ON `trendyol_product_cards` FOR EACH ROW BEGIN
    SET NEW.ProfitPercentage = (NEW.Trendyol_Selling_Price / NEW.Lowest_Sellable_Price) - 1;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trendyol_product_cards_update_profits_update` BEFORE UPDATE ON `trendyol_product_cards` FOR EACH ROW BEGIN
    SET NEW.ProfitPercentage = (NEW.Trendyol_Selling_Price / NEW.Lowest_Sellable_Price) - 1;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Temporary view structure for view `vw_hblistings`
--

DROP TABLE IF EXISTS `vw_hblistings`;
/*!50001 DROP VIEW IF EXISTS `vw_hblistings`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `vw_hblistings` AS SELECT 
 1 AS `HepsiburadaSku`,
 1 AS `MerchantSku`,
 1 AS `HbProductName`,
 1 AS `Price`,
 1 AS `ProductOrgUnitPrice`,
 1 AS `ProductUnitPrice`,
 1 AS `AvailableStock`,
 1 AS `DispatchTime`,
 1 AS `LowestSellablePrice`,
 1 AS `PriceWithoutExpenditure`,
 1 AS `CargoCompany1`,
 1 AS `CargoCompany2`,
 1 AS `CargoCompany3`,
 1 AS `ShippingAddressLabel`,
 1 AS `ClaimAddressLabel`,
 1 AS `MaximumPurchasableQuantity`,
 1 AS `MinimumPurchasableQuantity`,
 1 AS `IsSalable`,
 1 AS `DeactivationReasons`,
 1 AS `IsSuspended`,
 1 AS `IsLocked`,
 1 AS `LockReasons`,
 1 AS `IsFrozen`,
 1 AS `CommissionRate`,
 1 AS `IsFulfilledByHB`,
 1 AS `InBuybox`,
 1 AS `HasPricing`,
 1 AS `IncreasePrice`,
 1 AS `DecreasePrice`,
 1 AS `AutoBBActive`,
 1 AS `CanGetBuybox`,
 1 AS `LastUpdateDate`,
 1 AS `BasketRatio`,
 1 AS `BuyboxMerchantDispatchTime`,
 1 AS `BuyboxMerchantRatingName`,
 1 AS `BuyboxMerchantPrice`,
 1 AS `SecondMerchantDispatchTime`,
 1 AS `SecondMerchantRatingName`,
 1 AS `SecondMerchantPrice`,
 1 AS `ThirdMerchantDispatchTime`,
 1 AS `ThirdMerchantRatingName`,
 1 AS `ThirdMerchantPrice`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `vw_hblistingsft`
--

DROP TABLE IF EXISTS `vw_hblistingsft`;
/*!50001 DROP VIEW IF EXISTS `vw_hblistingsft`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `vw_hblistingsft` AS SELECT 
 1 AS `HepsiburadaSku`,
 1 AS `Brand`,
 1 AS `Category`,
 1 AS `ProductName`,
 1 AS `MerchantSku`,
 1 AS `UnitCountInProductCard`,
 1 AS `Price`,
 1 AS `PriceWithoutExpenditure`,
 1 AS `InBuyboxPrice`,
 1 AS `ProductOrgUnitPrice`,
 1 AS `UnitPrice`,
 1 AS `AvailableStock`,
 1 AS `TotalStock`,
 1 AS `LowestSellablePrice`,
 1 AS `IsSalable`,
 1 AS `IsSuspended`,
 1 AS `IsLocked`,
 1 AS `IsFrozen`,
 1 AS `CommissionRate`,
 1 AS `IsFulfilledByHB`,
 1 AS `InBuybox`,
 1 AS `HasPricing`,
 1 AS `IncreasePrice`,
 1 AS `DecreasePrice`,
 1 AS `ExitBuybox`,
 1 AS `MinimumPrice`,
 1 AS `MaximumPrice`,
 1 AS `CampaignCommissionRate`,
 1 AS `CampaignCommissionEndDate`,
 1 AS `LastUpdateDate`,
 1 AS `BasketRatio`,
 1 AS `BuyboxMerchant`,
 1 AS `BuyboxPrice`,
 1 AS `SecondMerchant`,
 1 AS `ThirdMerchant`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `vwstocktable`
--

DROP TABLE IF EXISTS `vwstocktable`;
/*!50001 DROP VIEW IF EXISTS `vwstocktable`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `vwstocktable` AS SELECT 
 1 AS `StockCode`,
 1 AS `ProductName`,
 1 AS `UnitPrice`,
 1 AS `UnitStock`,
 1 AS `SpecialPriceMultiplier`,
 1 AS `HbSpecialPriceMultiplier`,
 1 AS `TyAutomatedBuybox`,
 1 AS `HbAutomatedBuybox`*/;
SET character_set_client = @saved_cs_client;

--
-- Dumping events for database 'buyboxapp'
--

--
-- Dumping routines for database 'buyboxapp'
--
/*!50003 DROP FUNCTION IF EXISTS `sfGetAllHbProductCardCount` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `sfGetAllHbProductCardCount`(stockCode varchar(70)) RETURNS int
    DETERMINISTIC
BEGIN
	SET @HbProductCardCount := (SELECT COUNT(*) FROM buyboxapp.hblistings WHERE SF_GETBASESTOCKCODE(MerchantSku) = stockCode AND IsLocked = 0);
    if @HbProductCardCount is not null then
		return @HbProductCardCount;
	else
		return 0;
	end if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SFGETBASKETRATIOVIEW` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SFGETBASKETRATIOVIEW`(
`HepsiburadaSku` varchar(100)
) RETURNS varchar(200) CHARSET utf8mb4 COLLATE utf8mb4_turkish_ci
    DETERMINISTIC
BEGIN
return CONCAT(FORMAT((((1 - SFGETHBBASKETRATIO(`HepsiburadaSku`)) * 100) * (SFGETHBSTOREDEBTAMOUNT(`HepsiburadaSku`) / 100)),
                    2),
                ' / ',
                FORMAT((((1 - SFGETHBBASKETRATIO(`HepsiburadaSku`)) * 100) * ((100 - SFGETHBSTOREDEBTAMOUNT(`HepsiburadaSku`)) / 100)),
                    2));
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SFGETEXPENDITURE` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SFGETEXPENDITURE`(
	SellingPrice float
) RETURNS float
    DETERMINISTIC
BEGIN
	SET @ExThr = (select marketplacesettings.ExpenditureThreshold1 from marketplacesettings where MarketPlaceCode = 'HB');
	if @ExThr = 0 then
		return 0;
    else
		if SellingPrice > @ExThr then
			SET @ExThr = (select marketplacesettings.ExpenditureThreshold2 from marketplacesettings where MarketPlaceCode = 'HB');
            if @ExThr = 0 then
				return (select marketplacesettings.Expenditure1 from marketplacesettings where MarketPlaceCode = 'HB');
			else
				if SellingPrice > @ExThr then
					SET @ExThr = (select marketplacesettings.ExpenditureThreshold3 from marketplacesettings where MarketPlaceCode = 'HB');
                    if @ExThr = 0 then
						return (select marketplacesettings.Expenditure2 from marketplacesettings where MarketPlaceCode = 'HB');
					else
						if SellingPrice > @ExThr then
							SET @ExThr = (select marketplacesettings.ExpenditureThreshold4 from marketplacesettings where MarketPlaceCode = 'HB');
                            if @ExThr = 0 then
								return (select marketplacesettings.Expenditure3 from marketplacesettings where MarketPlaceCode = 'HB');
							else
								if SellingPrice > @ExThr then
									SET @ExThr = (select marketplacesettings.ExpenditureThreshold5 from marketplacesettings where MarketPlaceCode = 'HB');
									if @ExThr = 0 then
										return (select marketplacesettings.Expenditure4 from marketplacesettings where MarketPlaceCode = 'HB');
									else
										if SellingPrice > @ExThr then
											return 0;
										else
											return (select marketplacesettings.Expenditure5 from marketplacesettings where MarketPlaceCode = 'HB');
                                        end if;
                                    end if;
                                else
									return (select marketplacesettings.Expenditure3 from marketplacesettings where MarketPlaceCode = 'HB');
                                end if;
							end if;
                        else
							return (select marketplacesettings.Expenditure2 from marketplacesettings where MarketPlaceCode = 'HB');
                        end if;
					end if;
				else
					return (select marketplacesettings.Expenditure1 from marketplacesettings where MarketPlaceCode = 'HB');
				end if;
			end if;
		else
			return 0;
        end if;
    end if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `sfGetHbAutoBbActive` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `sfGetHbAutoBbActive`(`HbMerchantSku` VARCHAR(100)) RETURNS bit(1)
    DETERMINISTIC
BEGIN
set @baseStockCode := sf_getBaseStockCode(`HbMerchantSku`);
set @autoBbActive := (select stock_table.HbAutomatedBuybox from buyboxapp.stock_table where stock_table.Stock_Code = @baseStockCode);
if @autoBbActive is null then
	return 0;
else
	return @autoBbActive;
end if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SFGETHBBASKETRATIO` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SFGETHBBASKETRATIO`(
	`hepsiburadaSku` VARCHAR(50)
) RETURNS double
    DETERMINISTIC
BEGIN
	SET @sellingPrice := (SELECT hblistings.Price FROM hblistings WHERE hblistings.HepsiburadaSku = hepsiburadaSku);
	SET @basketSellingPrice := (SELECT hblistingpricings.FinalPrice FROM hblistingpricings WHERE hblistingpricings.HepsiburadaSku = hepsiburadaSku);
	if @basketSellingPrice IS NULL then
		RETURN 1.0;
	ELSE
		RETURN @basketSellingPrice / @sellingPrice ;
	END if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `sfGetHbCargoPrice` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `sfGetHbCargoPrice`(
	`unitPrice` DOUBLE,
	`basketDiscountRatio` DOUBLE,
	`commissionRate` DOUBLE,
	`storeDebtAmount` DOUBLE
) RETURNS double
    DETERMINISTIC
BEGIN
	SET @cargoPriceThreshold := (SELECT marketplacesettings.CargoPriceThreshold2 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
	SET @maxUnitPrice := sfGetHbPriceWithoutExpenditure(@cargoPriceThreshold / basketDiscountRatio, commissionRate, basketDiscountRatio, storeDebtAmount);
	if (unitPrice <= @maxUnitPrice) then 
		SET @cargoPriceThreshold := (SELECT marketplacesettings.ExpenditureThreshold1 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
		SET @maxUnitPrice := sfGetHbPriceWithoutExpenditure(@cargoPriceThreshold / basketDiscountRatio, commissionRate, basketDiscountRatio, storeDebtAmount);
		if (unitPrice <= @maxUnitPrice) then
			SET @cargoPriceThreshold := (SELECT marketplacesettings.CargoPriceThreshold1 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
			SET @maxUnitPrice := sfGetHbPriceWithoutExpenditure(@cargoPriceThreshold / basketDiscountRatio, commissionRate, basketDiscountRatio, storeDebtAmount);
			if (unitPrice <= @maxUnitPrice) then
				SET @cargoPrice := (SELECT marketplacesettings.CargoPrice1 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
				RETURN @cargoPrice;
			ELSE
				SET @cargoPrice := (SELECT marketplacesettings.CargoPrice2 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
				RETURN @cargoPrice;
			END if;
		ELSE
			SET @secondCargoPrice := (SELECT marketplacesettings.CargoPrice2 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
			SET @marketingExpenditure := (SELECT marketplacesettings.Expenditure1 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB'); 
			SET @cargoPrice := @secondCargoPrice + @marketingExpenditure;
			RETURN @cargoPrice;
		END if;
	ELSE
		SET @thirdCargoPrice := (SELECT marketplacesettings.CargoPrice3 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
		SET @marketingExpenditure := (SELECT marketplacesettings.Expenditure1 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
		SET @cargoPrice := @thirdCargoPrice + @marketingExpenditure;
		RETURN @cargoPrice;
	END if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `sfGetHbChangedPrice` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `sfGetHbChangedPrice`(
	`hepsiburadaSku` VARCHAR(100),
	`priceToAdd` DOUBLE
) RETURNS double
    DETERMINISTIC
BEGIN
	SET @merchantSku := (SELECT hblistings.MerchantSku FROM hblistings WHERE hblistings.HepsiburadaSku = hepsiburadaSku);
	SET @commissionRate := sfGetHbCommissionRate(hepsiburadaSku);
	SET @basketDiscountRatio := sfGetHbBasketRatio(hepsiburadaSku);
	SET @storeDebtAmount := sfGetHbStoreDebtAmount(hepsiBuradaSku);
	SET @sellingPrice := (SELECT hblistings.Price FROM hblistings WHERE hblistings.HepsiburadaSku = hepsiburadaSku);
	SET @priceWithoutExp := sfGetHbPriceWithoutExpenditure(@sellingPrice, @commissionRate, @basketDiscountRatio, @storeDebtAmount);
	SET @changedPrice := @priceWithoutExp + priceToAdd;
	SET @commissionMultiplier := 1 - (@commissionRate / 100);
	SET @cargoPriceThreshold := (SELECT marketplacesettings.CargoPriceThreshold2 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
	SET @maxUnitPrice := sfGetHbPriceWithoutExpenditure(@cargoPriceThreshold / @basketDiscountRatio, @commissionRate, @basketDiscountRatio, @storeDebtAmount);
	SET @basketDiscountMultiplier := 1 - @basketDiscountRatio;
	SET @storeBasketMultiplier := 1 - (@storeDebtAmount / 100 * @basketDiscountMultiplier);
	if (@changedPrice <= @maxUnitPrice) then 
		SET @cargoPriceThreshold := (SELECT marketplacesettings.ExpenditureThreshold1 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
		SET @maxUnitPrice := sfGetHbPriceWithoutExpenditure(@cargoPriceThreshold / @basketDiscountRatio, @commissionRate, @basketDiscountRatio, @storeDebtAmount);
		if (@changedPrice <= @maxUnitPrice) then
			SET @cargoPriceThreshold := (SELECT marketplacesettings.CargoPriceThreshold1 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
			SET @maxUnitPrice := sfGetHbPriceWithoutExpenditure(@cargoPriceThreshold / @basketDiscountRatio, @commissionRate, @basketDiscountRatio, @storeDebtAmount);
			if (@changedPrice <= @maxUnitPrice) then
				SET @firstCargoPrice := (SELECT marketplacesettings.CargoPrice1 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
				SET @lowestSellablePrice := (@changedPrice + @firstCargoPrice) / @commissionMultiplier / @storeBasketMultiplier;
			ELSE
				SET @secondCargoPrice := (SELECT marketplacesettings.CargoPrice2 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
				SET @lowestSellablePrice := (@changedPrice + @secondCargoPrice) / @commissionMultiplier / @storeBasketMultiplier;
			END if;
		ELSE
			SET @secondCargoPrice := (SELECT marketplacesettings.CargoPrice2 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
			SET @marketingExpenditure := (SELECT marketplacesettings.Expenditure1 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB'); 
			SET @lowestSellablePrice := (@changedPrice + @secondCargoPrice + @marketingExpenditure) / @commissionMultiplier / @storeBasketMultiplier;
		END if;
	ELSE
		SET @marketingExpenditure := (SELECT marketplacesettings.Expenditure1 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
		SET @thirdCargoPrice := (SELECT marketplacesettings.CargoPrice3 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
		SET @lowestSellablePrice := (@changedPrice + @thirdCargoPrice + @marketingExpenditure) / @commissionMultiplier / @storeBasketMultiplier;
	END if;
	RETURN @lowestSellablePrice;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SFGETHBCOMMISSIONRATE` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SFGETHBCOMMISSIONRATE`(
	`hepsiburadaSku` VARCHAR(50)
) RETURNS double
    DETERMINISTIC
BEGIN
	SET @commissionRate := (SELECT hblistings.CommissionRate FROM hblistings WHERE hblistings.HepsiburadaSku = hepsiburadaSku);
	SET @commissionVatMultiplier := 1.18;
	if @commissionRate IS NULL then
		RETURN 16.0 * 1.18;
	ELSE
		RETURN @commissionRate * @commissionVatMultiplier;
	END if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SFGETHBIBBPRICE` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SFGETHBIBBPRICE`(`hepsiburadaSku` VARCHAR(50)) RETURNS double
    DETERMINISTIC
BEGIN
	return SFGETHBPRICEWITHOUTEXPENDITURE(SFGETHBMERCHANTPRICE(`hepsiburadaSku`,0) / SFGETHBBASKETRATIO(`hepsiburadaSku`),
    SFGETHBCOMMISSIONRATE(`hepsiburadaSku`),SFGETHBBASKETRATIO(`hepsiburadaSku`),SFGETHBSTOREDEBTAMOUNT(`hepsiburadaSku`));
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SFGETHBINBUYBOX` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SFGETHBINBUYBOX`(
	`HepsiburadaSku` VARCHAR(100)
) RETURNS bit(1)
    DETERMINISTIC
BEGIN
	SET @buyboxSellerName := sfGetHbMerchantName(HepsiburadaSku, 0);
	SET @storeName := (SELECT marketplacesettings.MarketPlaceStoreName FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
	if @buyboxSellerName = '< ? >' then
		RETURN 0;
	else
		if @buyboxSellerName = @storeName then
			RETURN 1;
		ELSE
			RETURN 0;
		END if;
	END if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SFGETHBLOWESTSELLABLEPRICE` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SFGETHBLOWESTSELLABLEPRICE`(
	`hepsiburadaSku` VARCHAR(50),
	`merchantSku` VARCHAR(50),
	`priceToAdd` DOUBLE
) RETURNS double
    DETERMINISTIC
BEGIN
	SET @unitPrice := sfGetUnitPrice(merchantSku, sfGetPriceMultiplier(merchantSku)) + priceToAdd;
	SET @commissionRate := sfGetHbCommissionRate(hepsiburadaSku);
	SET @basketDiscountRatio := sfGetHbBasketRatio(hepsiburadaSku);
	SET @storeDebtAmount := sfGetHbStoreDebtAmount(hepsiBuradaSku);
	SET @commissionMultiplier := 1 - (@commissionRate / 100);
	SET @cargoPrice := sfGetHbCargoPrice(@unitPrice, @basketDiscountRatio, @commissionRate, @storeDebtAmount);
	SET @basketDiscountMultiplier := 1 - @basketDiscountRatio;
	SET @storeBasketMultiplier := 1 - ((@storeDebtAmount / 100) * @basketDiscountMultiplier);
	SET @lowestSellablePrice := (@unitPrice + @cargoPrice) / @commissionMultiplier / @storeBasketMultiplier;
	RETURN @lowestSellablePrice;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SFGETHBMERCHANTDISPATCHTIME` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SFGETHBMERCHANTDISPATCHTIME`(
	`hepsiburadaSku` VARCHAR(50),
	`merchantOrder` INT
) RETURNS varchar(10) CHARSET utf8mb4 COLLATE utf8mb4_turkish_ci
    DETERMINISTIC
BEGIN
	SET @jsonPath := CONCAT('$.buyboxOrders[',CONVERT(merchantOrder,CHAR),'].dispatchTime');
	SET @jsonText := (SELECT hbbuyboxorders.BuyboxOrders FROM hbbuyboxorders WHERE hbbuyboxorders.Sku = hepsiburadaSku);
	if @jsonText IS NULL then 
		RETURN '?';
	ELSE
		SET @merchantDispatchTime := json_extract(@jsonText,@jsonPath);
		if @merchantDispatchTime IS NULL then
			RETURN '?';
		ELSE
			RETURN @merchantDispatchTime;
		END if;		
	END if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `sfGetHbMerchantName` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `sfGetHbMerchantName`(
	`hepsiburadaSku` VARCHAR(50),
	`merchantOrder` INT
) RETURNS varchar(100) CHARSET utf8mb4 COLLATE utf8mb4_turkish_ci
    DETERMINISTIC
BEGIN
	SET @jsonPath := CONCAT('$.buyboxOrders[',CONVERT(merchantOrder,CHAR),'].merchantName');
	SET @jsonText := (SELECT hbbuyboxorders.BuyboxOrders FROM hbbuyboxorders WHERE hbbuyboxorders.Sku = hepsiburadaSku);
	if @jsonText IS NULL then 
		RETURN '< ? >';
	ELSE
		SET @merchantName := json_extract(@jsonText,@jsonPath);
		if @merchantName IS NULL then
			RETURN '< ? >';
		ELSE
			RETURN TRIM(BOTH '"' FROM @merchantName);
		END if;		
	END if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SFGETHBMERCHANTNAMERATINGVIEW` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SFGETHBMERCHANTNAMERATINGVIEW`(
	`hepsiburadaSku` VARCHAR(50),
	`merchantOrder` INT
) RETURNS varchar(200) CHARSET utf8mb4 COLLATE utf8mb4_turkish_ci
    DETERMINISTIC
BEGIN
	SET @jsonText := (SELECT hbbuyboxorders.BuyboxOrders FROM hbbuyboxorders WHERE hbbuyboxorders.Sku = hepsiburadaSku);
	if @jsonText IS NULL then 
		RETURN '< ? >';
	ELSE
		SET @merchantName := sfGetHbMerchantName(hepsiburadaSku, merchantOrder);
		SET @merchantRating := sfGetHbMerchantRating(hepsiburadaSku, merchantOrder);
		if @merchantName = '< ? >' then
			RETURN '< ? >';
		ELSE
			SET @merchantNameRatingView := CONCAT(@merchantRating,' / ',@merchantName);
			RETURN @merchantNameRatingView;
		END if;		
	END if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SFGETHBMERCHANTPRICE` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SFGETHBMERCHANTPRICE`(
	`hepsiburadaSku` VARCHAR(50),
	`merchantOrder` INT
) RETURNS double
    DETERMINISTIC
BEGIN
	SET @jsonPath := CONCAT('$.buyboxOrders[',CONVERT(merchantOrder,CHAR),'].price');
	SET @jsonText := (SELECT hbbuyboxorders.BuyboxOrders FROM hbbuyboxorders WHERE hbbuyboxorders.Sku = hepsiburadaSku);
	if @jsonText IS NULL then 
		RETURN -1;
	ELSE
		SET @merchantPrice := json_extract(@jsonText,@jsonPath);
		if @merchantPrice IS NULL then
			RETURN -1;
		ELSE
			RETURN @merchantPrice;
		END if;		
	END if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SFGETHBMERCHANTPRICEVIEW` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SFGETHBMERCHANTPRICEVIEW`(
	`hepsiburadaSku` VARCHAR(50),
	`merchantOrder` INT
) RETURNS varchar(50) CHARSET utf8mb4 COLLATE utf8mb4_turkish_ci
    DETERMINISTIC
BEGIN
	SET @basketRatio := sfGetHbBasketRatio(hepsiburadaSku);
	SET @merchantPrice := sfGetHbMerchantPrice(hepsiburadaSku, merchantOrder);
	if @merchantPrice = -1 then 
		RETURN '< ? >';
	ELSE
		SET @listingPrice := @merchantPrice / @basketRatio;
		SET @listingPriceView := FORMAT(@listingPrice,2);
		SET @merchantPriceView := FORMAT(@merchantPrice,2);
		SET @merchantPriceView := CONCAT(@listingPriceView,' / ',@merchantPriceView);
		RETURN @merchantPriceView;
	END if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `sfGetHbMerchantRating` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `sfGetHbMerchantRating`(
	`hepsiburadaSku` VARCHAR(50),
	`merchantOrder` INT
) RETURNS varchar(50) CHARSET utf8mb4 COLLATE utf8mb4_turkish_ci
    DETERMINISTIC
BEGIN
	SET @jsonPath := CONCAT('$.buyboxOrders[',CONVERT(merchantOrder,CHAR),'].merchantRating');
	SET @jsonText := (SELECT hbbuyboxorders.BuyboxOrders FROM hbbuyboxorders WHERE hbbuyboxorders.Sku = hepsiburadaSku);
	if @jsonText IS NULL then 
		RETURN '< ? >';
	ELSE
		SET @merchantRating := json_extract(@jsonText,@jsonPath);
		if @merchantRating IS NULL then
			RETURN '< ? >';
		ELSE
			RETURN @merchantRating;
		END if;		
	END if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SFGETHBMERCHANTVIEW` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SFGETHBMERCHANTVIEW`(
`hepsiburadaSku` VARCHAR(50),
	`merchantOrder` INT) RETURNS varchar(200) CHARSET utf8mb4 COLLATE utf8mb4_turkish_ci
    DETERMINISTIC
BEGIN
	return concat(SFGETHBMERCHANTDISPATCHTIME(`hepsiburadaSku`,`merchantOrder`)
    ,' | ',SFGETHBMERCHANTNAMERATINGVIEW(`hepsiburadaSku`,`merchantOrder`),
    ' | ',SFGETHBMERCHANTPRICEVIEW(`hepsiburadaSku`,`merchantOrder`));
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SFGETHBPRICEWITHOUTEXPENDITURE` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SFGETHBPRICEWITHOUTEXPENDITURE`(
	`sellingPrice` DOUBLE,
	`commissionRate` DOUBLE,
	`basketDiscountRatio` DOUBLE,
	`storeDebtAmount` DOUBLE
) RETURNS double
    DETERMINISTIC
BEGIN
	SET @finalPrice := sellingPrice * basketDiscountRatio;
	SET @totalBasketAmount := sellingPrice * (1 - basketDiscountRatio);
	SET @storeBasketAmount := @totalBasketAmount * (storeDebtAmount / 100);
	SET @hbBasketAmount := @totalBasketAmount - @storeBasketAmount;
	SET @listingPrice := sellingPrice - @storeBasketAmount;
	SET @commissionAmount := @listingPrice * (commissionRate / 100);
	SET @cargoPrice := sf_getHbCargoPrice(@finalPrice);
	if (@finalPrice) > (SELECT marketplacesettings.ExpenditureThreshold1 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB') then
		SET @otherExpenses := (SELECT marketplacesettings.Expenditure1 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
	ELSE
		SET @otherExpenses := 0;
	END if;
	SET @priceWithoutExpenses := @finalPrice - @commissionAmount - @cargoPrice + @hbBasketAmount - @otherExpenses;
	RETURN @priceWithoutExpenses;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SFGETHBSTOREDEBTAMOUNT` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SFGETHBSTOREDEBTAMOUNT`(
	`hepsiBuradaSku` VARCHAR(50)
) RETURNS double
    DETERMINISTIC
BEGIN
	SET @storeDebtAmount = (SELECT hblistingpricings.StoreDebtAmount FROM hblistingpricings WHERE hblistingpricings.HepsiburadaSku = hepsiBuradaSku);
	if @storeDebtAmount IS NULL then
		RETURN 0;
	ELSE
		RETURN @storeDebtAmount;
	END if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `sfGetHbTotalOnSaleStock` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `sfGetHbTotalOnSaleStock`(
	`stockCode` VARCHAR(100)
) RETURNS int
    DETERMINISTIC
BEGIN
	SET @unitCount := (SELECT SUM(sfGetUnitCountFromStockCode(hblistings.MerchantSku) * hblistings.AvailableStock) FROM hblistings WHERE sf_getBaseStockCode(hblistings.MerchantSku) = stockCode);
	if @unitcount IS NULL then
		RETURN 0;
	ELSE
		RETURN @unitCount;
	END if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SFGETPRICEMULTIPLIER` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SFGETPRICEMULTIPLIER`(
	`Stockcode` VARCHAR(100)
) RETURNS double
    DETERMINISTIC
BEGIN
	DECLARE PriceMultiplier DOUBLE DEFAULT 0.0;
	SET PriceMultiplier := (SELECT stock_table.HbSpecialPriceMultiplier FROM stock_table WHERE stock_table.Stock_Code = sf_getBaseStockCode(Stockcode));
	RETURN PriceMultiplier;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `sfGetTotalStock` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `sfGetTotalStock`(`hbMerchantSku` varchar(100)) RETURNS int
    DETERMINISTIC
BEGIN

	DECLARE BaseUnitCount DOUBLE DEFAULT 999999;
	SET @Location = position('-' in hbMerchantSku);
	if @Location > 0 then
		SET @AfterDash = (SUBSTRING_INDEX(hbMerchantSku,'-',-1));
        SET @Location = position('k' in hbMerchantSku);
        if @Location > 0 then
			SET @stockCodes := (SELECT BundleUnitStockCodes FROM buyboxapp.bundletablev2 where bundletablev2.BundleStockCode = hbMerchantSku);
			if @stockCodes is not null then
				if @stockCodes like '%|%' then
					SET @UnitCount := (Select stock_table.Unit_Stock FROM stock_table WHERE stock_table.Stock_Code = sf_getBaseStockCode(SUBSTRING_INDEX(@stockCodes,'|',1)));
					if @UnitCount is not null then
						if @UnitCount < BaseUnitCount then
							SET BaseUnitCount = @UnitCount;
						end if;
					else
						RETURN 0;
					end if;
					SET @stockCodes = SUBSTRING_INDEX(@stockCodes,'|',-1);
					if @stockCodes like '%|%' then
						SET @UnitCount := (Select stock_table.Unit_Stock FROM stock_table WHERE stock_table.Stock_Code = sf_getBaseStockCode(SUBSTRING_INDEX(@stockCodes,'|',1)));
						if @UnitCount is not null then
							if @UnitCount < BaseUnitCount then
								SET BaseUnitCount = @UnitCount;
							end if;
						else
							RETURN 0;
						end if;
						SET @stockCodes = SUBSTRING_INDEX(@stockCodes,'|',-1);
						if @stockCodes like '%|%' then
							SET @UnitCount := (Select stock_table.Unit_Stock FROM stock_table WHERE stock_table.Stock_Code = sf_getBaseStockCode(SUBSTRING_INDEX(@stockCodes,'|',1)));
							if @UnitCount is not null then
								if @UnitCount < BaseUnitCount then
									SET BaseUnitCount = @UnitCount;
								end if;
							else
								return 0;
							end if;
							SET @stockCodes = SUBSTRING_INDEX(@stockCodes,'|',-1);
							if @stockCodes like '%|%' then
								SET @UnitCount := (Select stock_table.Unit_Stock FROM stock_table WHERE stock_table.Stock_Code = sf_getBaseStockCode(SUBSTRING_INDEX(@stockCodes,'|',1)));
								if @UnitCount is not null then
									if @UnitCount < BaseUnitCount then
										SET BaseUnitCount = @UnitCount;
									end if;
								else
									return 0;
								end if;
								SET @stockCodes = SUBSTRING_INDEX(@stockCodes,'|',-1);
								if @stockCodes like '%|%' then
									SET @UnitCount := (Select stock_table.Unit_Stock FROM stock_table WHERE stock_table.Stock_Code = sf_getBaseStockCode(SUBSTRING_INDEX(@stockCodes,'|',1)));
									if @UnitCount is not null then
										if @UnitCount < BaseUnitCount then
											SET BaseUnitCount = @UnitCount;
										end if;
									else
										return 0;
									end if;
									SET @stockCodes = SUBSTRING_INDEX(@stockCodes,'|',-1);
									SET @UnitCount := (Select stock_table.Unit_Stock FROM stock_table WHERE stock_table.Stock_Code = sf_getBaseStockCode(@stockCodes));
									if @UnitCount is not null then
										if @UnitCount < BaseUnitCount then
											SET BaseUnitCount = @UnitCount;
										end if;
									else
										RETURN 0;
									end if;
								else
									SET @UnitCount := (Select stock_table.Unit_Stock FROM stock_table WHERE stock_table.Stock_Code = sf_getBaseStockCode(@stockCodes));
									if @UnitCount is not null then
										if @UnitCount < BaseUnitCount then
											SET BaseUnitCount = @UnitCount;
										end if;
									else
										RETURN 0;
									end if;
								end if;
							else
								SET @UnitCount := (Select stock_table.Unit_Stock FROM stock_table WHERE stock_table.Stock_Code = sf_getBaseStockCode(@stockCodes));
								if @UnitCount is not null then
									if @UnitCount < BaseUnitCount then
										SET BaseUnitCount = @UnitCount;
									end if;
								else
									RETURN 0;
								end if;
							end if;
						else
							SET @UnitCount := (Select stock_table.Unit_Stock FROM stock_table WHERE stock_table.Stock_Code = sf_getBaseStockCode(@stockCodes));
							if @UnitCount is not null then
								if @UnitCount < BaseUnitCount then
									SET BaseUnitCount = @UnitCount;
								end if;
							else
								RETURN 0;
							end if;
						end if;
					else
						SET @UnitCount := (Select stock_table.Unit_Stock FROM stock_table WHERE stock_table.Stock_Code = sf_getBaseStockCode(@stockCodes));
						if @UnitCount is not null then
							if @UnitCount < BaseUnitCount then
								SET BaseUnitCount = @UnitCount;
							end if;
						else
							RETURN 0;
						end if;
					end if;
				else
					SET @UnitCount := (Select stock_table.Unit_Stock FROM stock_table WHERE stock_table.Stock_Code = sf_getBaseStockCode(@stockCodes));
					if @UnitCount is not null then
						if @UnitCount < BaseUnitCount then
							SET BaseUnitCount = @UnitCount;
						end if;
					else
						RETURN 0;
					end if;
				end if;
			else
				RETURN 0;
			end if;
			if BaseUnitCount = 999999 then
				return 0;
			end if;
			RETURN BaseUnitCount;
		else
			SET @UnitStock = (Select stock_table.Unit_Stock FROM stock_table WHERE stock_table.Stock_Code = sf_getBaseStockCode(hbMerchantSku));
        end if;
	else
		SET @UnitStock = (Select stock_table.Unit_Stock FROM stock_table WHERE stock_table.Stock_Code = hbMerchantSku);
    end if;
    return @UnitStock;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `sfGetTyBestPrice` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `sfGetTyBestPrice`(
    `merchantSku` VARCHAR(50)
) RETURNS double
    DETERMINISTIC
BEGIN
    DECLARE trimmed_merchantSku VARCHAR(255);
    DECLARE buybox_price DOUBLE;
    
    IF INSTR(merchantSku, '.') > 0 THEN
        SET trimmed_merchantSku = SUBSTRING_INDEX(merchantSku, '.', 1) COLLATE utf8mb4_turkish_ci;
    ELSE
        SET trimmed_merchantSku = merchantSku COLLATE utf8mb4_turkish_ci;
    END IF;
    
    SET trimmed_merchantSku = REPLACE(trimmed_merchantSku, '-1', '');  -- trim "-1" at the end of the string
    
    SELECT BuyBox_Seller_Price INTO buybox_price
    FROM buyboxapp.trendyol_product_cards
    WHERE Seller_Stock_Code COLLATE utf8mb4_turkish_ci = trimmed_merchantSku
    and On_Sale = 1
    order by BuyBox_Seller_Price asc limit 1;
    
    IF buybox_price IS NULL THEN
        RETURN 0;
    ELSE
        RETURN buybox_price;
    END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `sfGetTyGetTotalSellingStock` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `sfGetTyGetTotalSellingStock`(
	`stockCode` VARCHAR(50)
) RETURNS mediumint
    DETERMINISTIC
BEGIN
	SET @totalSellingStock := (SELECT sum(sfGetUnitCountFromStockCode(Seller_Stock_Code) * trendyol_product_cards.Selling_Stock) FROM trendyol_product_cards WHERE trendyol_product_cards.Seller_Stock_Code like CONCAT(stockCode,'%'));
	if @totalSellingStock IS NULL then
		RETURN 0;
	else
		RETURN @totalSellingStock;
	END if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `sfGetUnitCountFromStockCode` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `sfGetUnitCountFromStockCode`(
	`stockCode` VARCHAR(100)
) RETURNS tinyint
    DETERMINISTIC
BEGIN
	SET @unitCount = 1;
	SET @hasDash := LOCATE('-',stockCode);
	if @hasDash then
		SET @afterDash := SUBSTRING_INDEX(Stockcode,'-',-1);
		SET @isBundle := LOCATE('k',@afterDash);
		if @isBundle then
			SET @unitCount := 1;
		ELSE
			if LOCATE('.',@afterDash) then
				set @unitCount := Convert(SUBSTRING_INDEX(@afterDash,'.',1),UNSIGNED);
			ELSE
				set @unitCount := Convert(@afterDash,UNSIGNED);
			END if;
		END if;
	else
		SET @unitCount := 1;
	END if;
	RETURN @unitCount;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SFGETUNITPRICE` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SFGETUNITPRICE`(
	`Stockcode` VARCHAR(50),
	`PriceMultiplier` DOUBLE
) RETURNS double
    DETERMINISTIC
BEGIN
	DECLARE UnitPrice DOUBLE DEFAULT 0.0;
	DECLARE BaseUnitPrice DOUBLE DEFAULT 0.0;
	DECLARE ProductCount INT UNSIGNED DEFAULT 1;
	SET @hasDash := LOCATE('-',Stockcode);
	if @hasDash then
		SET @afterDash := SUBSTRING_INDEX(Stockcode,'-',-1);
		SET @isBundle := LOCATE('k',@afterDash);
		SET BaseUnitPrice := (Select stock_table.Unit_Price FROM stock_table WHERE stock_table.Stock_Code = sf_getBaseStockCode(Stockcode));
        if BaseUnitPrice is null then
			return -1;
        end if;
		if @isBundle > 0 then
			SET @stockCodes := (SELECT BundleUnitStockCodes FROM buyboxapp.bundletablev2 where bundletablev2.BundleStockCode = Stockcode);
            if @stockCodes is not null then
				SET @delCount = SfSubstringCount('|',@stockCodes);
				WHILE(@delCount >= 0) DO
					SET BaseUnitPrice := (Select stock_table.Unit_Price * stock_table.HbSpecialPriceMultiplier  FROM stock_table WHERE stock_table.Stock_Code = sf_getBaseStockCode(SUBSTRING_INDEX(@stockCodes,'|',1)));
				 	SET UnitPrice := UnitPrice + (BaseUnitPrice * sfGetUnitCountFromStockCode(SUBSTRING_INDEX(@stockCodes,'|',1)));
					SET @stockCodes = SUBSTRING_INDEX(@stockCodes,'|',-1 * @delCount);
				 	set @delCount = @delCount - 1;
				END WHILE;
			else
				SET UnitPrice := 999;
            end if;
			RETURN UnitPrice;
		ELSE
			SET @hasDot := LOCATE('.',@afterDash);
			if @hasDot then
				set ProductCount := Convert(SUBSTRING_INDEX(@afterDash,'.',1),UNSIGNED);
			ELSE
				set ProductCount := Convert(@afterDash,UNSIGNED);
			END if;
			SET UnitPrice := BaseUnitPrice * ProductCount;
			RETURN UnitPrice * PriceMultiplier;
		END if;
	else
		SET UnitPrice := (Select stock_table.Unit_Price FROM stock_table WHERE stock_table.Stock_Code = Stockcode);
        if UnitPrice is null then
			set UnitPrice := -1;
            return UnitPrice;
        end if;
		RETURN UnitPrice * PriceMultiplier;
	END if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SfSubstringCount` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SfSubstringCount`(
	`word` VARCHAR(100),
    `sequence` VARCHAR(1000)
) RETURNS tinyint
    DETERMINISTIC
BEGIN
    DECLARE counter SMALLINT UNSIGNED DEFAULT 0;
    DECLARE word_length SMALLINT UNSIGNED;

    SET word_length = CHAR_LENGTH(word);

    WHILE (INSTR(sequence,word) != 0) DO
        SET counter = counter+1;
        SET sequence = SUBSTR(sequence, INSTR(sequence,word)+word_length);
    END WHILE; 
    RETURN counter;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SF_GETBASESTOCKCODE` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SF_GETBASESTOCKCODE`(
	`HbMerchantSku` VARCHAR(100)
) RETURNS tinytext CHARSET utf8mb4 COLLATE utf8mb4_turkish_ci
    DETERMINISTIC
    COMMENT 'Splits the parameter with ''-'' and returns the first substring'
BEGIN
    if locate('-',HbMerchantSku) > 0 then
		RETURN SUBSTRING_INDEX(HbMerchantSku,'-',1);
	else
		return HbMerchantSku;
	end if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `sf_getHbCargoPrice` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `sf_getHbCargoPrice`(
	`sellingPrice` DOUBLE
) RETURNS double
    DETERMINISTIC
BEGIN
	DECLARE cargoPrice DOUBLE;
	if sellingPrice > (SELECT marketplacesettings.CargoPriceThreshold2 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB') then
		SET cargoPrice := (SELECT marketplacesettings.CargoPrice3 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
	ELSE
		if sellingPrice > (SELECT marketplacesettings.CargoPriceThreshold1 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB') then
			SET cargoPrice := (SELECT marketplacesettings.CargoPrice2 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
		ELSE
			SET cargoPrice := (SELECT marketplacesettings.CargoPrice1 FROM marketplacesettings WHERE marketplacesettings.MarketPlaceCode = 'HB');
		END if;
	END if;
	RETURN cargoPrice;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `SF_GETPRODUCTNAME` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `SF_GETPRODUCTNAME`(
	`Stockcode` VARCHAR(100)
) RETURNS tinytext CHARSET utf8mb4 COLLATE utf8mb4_turkish_ci
    DETERMINISTIC
BEGIN
	DECLARE ProductName TINYTEXT DEFAULT '';
	DECLARE ProductCount TINYTEXT DEFAULT '1';
	if LOCATE('-',Stockcode) then
		SET ProductName := (Select stock_table.Product_Name FROM stock_table WHERE stock_table.Stock_Code = sf_getBaseStockCode(Stockcode));
		if LOCATE('k',SUBSTRING_INDEX(Stockcode,'-',-1)) then
			SET ProductName := CONCAT(ProductName,' Paket ürün');
			RETURN ProductName;
		else
			SET ProductCount := SUBSTRING_INDEX(Stockcode,'-',-1);
			if LOCATE('.',ProductCount) then
				set ProductCount := SUBSTRING_INDEX(ProductCount,'.',1);
			END if;
			SET ProductName := CONCAT(ProductName,' ',ProductCount,' adet çoklu ürün');
			RETURN ProductName;
		END if;
	else
		SET ProductName := (Select stock_table.Product_Name FROM stock_table WHERE stock_table.Stock_Code = Stockcode);
        if ProductName is null then
			set ProductName := '< ? >';
            return ProductName;
		else
			RETURN ProductName;
		end if;
	END if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `DENEMESP` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_AUTO_VALUE_ON_ZERO' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `DENEMESP`()
BEGIN
	DECLARE done BOOLEAN DEFAULT FALSE;
    DECLARE a varchar(40);
	DECLARE cur1 CURSOR FOR SELECT stock_table.Stock_Code
		FROM buyboxapp.stock_table;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    OPEN cur1;
	denemeLoop : loop
		fetch cur1 into a;
		if done then
			leave denemeLoop;
		end if;
		SET @tempValue = (SELECT COUNT(*) 
			FROM buyboxapp.hblistings 
			WHERE SF_GETBASESTOCKCODE(MerchantSku) = a AND IsLocked = 0);
		if @tempValue is not null then
			update buyboxapp.stock_table set HbProductCardCount = @tempValue 
				WHERE Stock_Code = a;
		end if;
	end loop;
    close cur1;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Final view structure for view `order_products_view`
--

/*!50001 DROP VIEW IF EXISTS `order_products_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `order_products_view` AS select `order_products`.`ProductCardId` AS `ProductCardId`,`order_products`.`OrderNumber` AS `OrderNumber`,`order_products`.`StockCode` AS `StockCode`,`order_products`.`CargoPaymentInfo` AS `CargoPaymentInfo`,`order_products`.`ProductName` AS `ProductName`,`order_products`.`Commission` AS `Commission`,`order_products`.`DueDate` AS `DueDate`,`order_products`.`OrderDate` AS `OrderDate`,`order_products`.`DeliveryType` AS `DeliveryType`,`order_products`.`Gtip` AS `Gtip`,`order_products`.`ProductBarcode` AS `ProductBarcode`,`order_products`.`Quantity` AS `Quantity`,`order_products`.`UnitPrice` AS `UnitPrice`,`order_products`.`CargoPrice` AS `CargoPrice`,`order_products`.`Expenditure` AS `Expenditure`,`order_products`.`Price` AS `Price`,`order_products`.`TotalPrice` AS `TotalPrice`,`order_products`.`CommissionRate` AS `CommissionRate`,`order_products`.`TotalDiscount` AS `TotalDiscount`,`order_products`.`Vat` AS `Vat`,`order_products`.`VatRate` AS `VatRate`,`order_products`.`DiscountToBeBilled` AS `DiscountToBeBilled`,`order_products`.`Marketplace` AS `Marketplace` from `order_products` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `vw_hblistings`
--

/*!50001 DROP VIEW IF EXISTS `vw_hblistings`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `vw_hblistings` AS select `hblistings`.`HepsiburadaSku` AS `HepsiburadaSku`,`hblistings`.`MerchantSku` AS `MerchantSku`,`SF_GETPRODUCTNAME`(`hblistings`.`MerchantSku`) AS `HbProductName`,`hblistings`.`Price` AS `Price`,`SFGETUNITPRICE`(`hblistings`.`MerchantSku`,1.0) AS `ProductOrgUnitPrice`,`SFGETUNITPRICE`(`hblistings`.`MerchantSku`,`SFGETPRICEMULTIPLIER`(`hblistings`.`MerchantSku`)) AS `ProductUnitPrice`,`hblistings`.`AvailableStock` AS `AvailableStock`,`hblistings`.`DispatchTime` AS `DispatchTime`,`SFGETHBLOWESTSELLABLEPRICE`(`hblistings`.`HepsiburadaSku`,`hblistings`.`MerchantSku`,0) AS `LowestSellablePrice`,`SFGETHBPRICEWITHOUTEXPENDITURE`(`hblistings`.`Price`,`SFGETHBCOMMISSIONRATE`(`hblistings`.`HepsiburadaSku`),`SFGETHBBASKETRATIO`(`hblistings`.`HepsiburadaSku`),`SFGETHBSTOREDEBTAMOUNT`(`hblistings`.`HepsiburadaSku`)) AS `PriceWithoutExpenditure`,`hblistings`.`CargoCompany1` AS `CargoCompany1`,`hblistings`.`CargoCompany2` AS `CargoCompany2`,`hblistings`.`CargoCompany3` AS `CargoCompany3`,`hblistings`.`ShippingAddressLabel` AS `ShippingAddressLabel`,`hblistings`.`ClaimAddressLabel` AS `ClaimAddressLabel`,`hblistings`.`MaximumPurchasableQuantity` AS `MaximumPurchasableQuantity`,`hblistings`.`MinimumPurchasableQuantity` AS `MinimumPurchasableQuantity`,`hblistings`.`IsSalable` AS `IsSalable`,`hblistings`.`DeactivationReasons` AS `DeactivationReasons`,`hblistings`.`IsSuspended` AS `IsSuspended`,`hblistings`.`IsLocked` AS `IsLocked`,`hblistings`.`LockReasons` AS `LockReasons`,`hblistings`.`IsFrozen` AS `IsFrozen`,`hblistings`.`CommissionRate` AS `CommissionRate`,`hblistings`.`IsFulfilledByHB` AS `IsFulfilledByHB`,`SFGETHBINBUYBOX`(`hblistings`.`HepsiburadaSku`) AS `InBuybox`,`hblistings`.`HasPricing` AS `HasPricing`,`hblistings`.`IncreasePrice` AS `IncreasePrice`,`hblistings`.`DecreasePrice` AS `DecreasePrice`,`SFGETHBAUTOBBACTIVE`(`hblistings`.`MerchantSku`) AS `AutoBBActive`,((`SFGETHBLOWESTSELLABLEPRICE`(`hblistings`.`HepsiburadaSku`,`hblistings`.`MerchantSku`,0) < `SFGETHBMERCHANTPRICE`(`hblistings`.`HepsiburadaSku`,0)) and (0 = `SFGETHBINBUYBOX`(`hblistings`.`HepsiburadaSku`))) AS `CanGetBuybox`,`hblistings`.`LastUpdateDate` AS `LastUpdateDate`,`SFGETBASKETRATIOVIEW`(`hblistings`.`HepsiburadaSku`) AS `BasketRatio`,`SFGETHBMERCHANTDISPATCHTIME`(`hblistings`.`HepsiburadaSku`,0) AS `BuyboxMerchantDispatchTime`,`SFGETHBMERCHANTNAMERATINGVIEW`(`hblistings`.`HepsiburadaSku`,0) AS `BuyboxMerchantRatingName`,`SFGETHBMERCHANTPRICEVIEW`(`hblistings`.`HepsiburadaSku`,0) AS `BuyboxMerchantPrice`,`SFGETHBMERCHANTDISPATCHTIME`(`hblistings`.`HepsiburadaSku`,1) AS `SecondMerchantDispatchTime`,`SFGETHBMERCHANTNAMERATINGVIEW`(`hblistings`.`HepsiburadaSku`,1) AS `SecondMerchantRatingName`,`SFGETHBMERCHANTPRICEVIEW`(`hblistings`.`HepsiburadaSku`,1) AS `SecondMerchantPrice`,`SFGETHBMERCHANTDISPATCHTIME`(`hblistings`.`HepsiburadaSku`,2) AS `ThirdMerchantDispatchTime`,`SFGETHBMERCHANTNAMERATINGVIEW`(`hblistings`.`HepsiburadaSku`,2) AS `ThirdMerchantRatingName`,`SFGETHBMERCHANTPRICEVIEW`(`hblistings`.`HepsiburadaSku`,2) AS `ThirdMerchantPrice` from (((`hblistings` left join `hbbuyboxorders` on((`hblistings`.`HepsiburadaSku` = `hbbuyboxorders`.`Sku`))) left join `hblistingpricings` on((`hblistings`.`HepsiburadaSku` = `hblistingpricings`.`HepsiburadaSku`))) left join `stock_table` on((`SF_GETBASESTOCKCODE`(`hblistings`.`MerchantSku`) = `stock_table`.`Stock_Code`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `vw_hblistingsft`
--

/*!50001 DROP VIEW IF EXISTS `vw_hblistingsft`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `vw_hblistingsft` AS select `hblistings`.`HepsiburadaSku` AS `HepsiburadaSku`,`hblistings`.`Brand` AS `Brand`,`hblistings`.`Category` AS `Category`,`hblistings`.`ProductName` AS `ProductName`,`hblistings`.`MerchantSku` AS `MerchantSku`,`SFGETUNITCOUNTFROMSTOCKCODE`(`hblistings`.`MerchantSku`) AS `UnitCountInProductCard`,`hblistings`.`Price` AS `Price`,`SFGETHBPRICEWITHOUTEXPENDITURE`(`hblistings`.`Price`,`SFGETHBCOMMISSIONRATE`(`hblistings`.`HepsiburadaSku`),`SFGETHBBASKETRATIO`(`hblistings`.`HepsiburadaSku`),`SFGETHBSTOREDEBTAMOUNT`(`hblistings`.`HepsiburadaSku`)) AS `PriceWithoutExpenditure`,`SFGETHBIBBPRICE`(`hblistings`.`HepsiburadaSku`) AS `InBuyboxPrice`,`SFGETUNITPRICE`(`hblistings`.`MerchantSku`,1.0) AS `ProductOrgUnitPrice`,`SFGETUNITPRICE`(`hblistings`.`MerchantSku`,`SFGETPRICEMULTIPLIER`(`hblistings`.`MerchantSku`)) AS `UnitPrice`,`hblistings`.`AvailableStock` AS `AvailableStock`,`SFGETTOTALSTOCK`(`hblistings`.`MerchantSku`) AS `TotalStock`,`SFGETHBLOWESTSELLABLEPRICE`(`hblistings`.`HepsiburadaSku`,`hblistings`.`MerchantSku`,0) AS `LowestSellablePrice`,`hblistings`.`IsSalable` AS `IsSalable`,`hblistings`.`IsSuspended` AS `IsSuspended`,`hblistings`.`IsLocked` AS `IsLocked`,`hblistings`.`IsFrozen` AS `IsFrozen`,`hblistings`.`CommissionRate` AS `CommissionRate`,`hblistings`.`IsFulfilledByHB` AS `IsFulfilledByHB`,`SFGETHBINBUYBOX`(`hblistings`.`HepsiburadaSku`) AS `InBuybox`,`hblistings`.`HasPricing` AS `HasPricing`,`hblistings`.`IncreasePrice` AS `IncreasePrice`,`hblistings`.`DecreasePrice` AS `DecreasePrice`,`hblistings`.`ExitBuybox` AS `ExitBuybox`,`hblistings`.`MinimumPrice` AS `MinimumPrice`,`hblistings`.`MaximumPrice` AS `MaximumPrice`,`hblistings`.`CampaignCommissionRate` AS `CampaignCommissionRate`,`hblistings`.`CampaignCommissionEndDate` AS `CampaignCommissionEndDate`,`hblistings`.`LastUpdateDate` AS `LastUpdateDate`,`SFGETBASKETRATIOVIEW`(`hblistings`.`HepsiburadaSku`) AS `BasketRatio`,`SFGETHBMERCHANTVIEW`(`hblistings`.`HepsiburadaSku`,0) AS `BuyboxMerchant`,`SFGETHBMERCHANTPRICE`(`hblistings`.`HepsiburadaSku`,0) AS `BuyboxPrice`,`SFGETHBMERCHANTVIEW`(`hblistings`.`HepsiburadaSku`,1) AS `SecondMerchant`,`SFGETHBMERCHANTVIEW`(`hblistings`.`HepsiburadaSku`,2) AS `ThirdMerchant` from (((`hblistings` left join `hbbuyboxorders` on((`hblistings`.`HepsiburadaSku` = `hbbuyboxorders`.`Sku`))) left join `hblistingpricings` on((`hblistings`.`HepsiburadaSku` = `hblistingpricings`.`HepsiburadaSku`))) left join `stock_table` on((`SF_GETBASESTOCKCODE`(`hblistings`.`MerchantSku`) = `stock_table`.`Stock_Code`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `vwstocktable`
--

/*!50001 DROP VIEW IF EXISTS `vwstocktable`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `vwstocktable` AS select `stock_table`.`Stock_Code` AS `StockCode`,`stock_table`.`Product_Name` AS `ProductName`,`stock_table`.`Unit_Price` AS `UnitPrice`,`stock_table`.`Unit_Stock` AS `UnitStock`,`stock_table`.`Special_Price_Multiplier` AS `SpecialPriceMultiplier`,`stock_table`.`HbSpecialPriceMultiplier` AS `HbSpecialPriceMultiplier`,`stock_table`.`Automated_Buybox` AS `TyAutomatedBuybox`,`stock_table`.`HbAutomatedBuybox` AS `HbAutomatedBuybox` from `stock_table` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2024-02-02 14:51:04
