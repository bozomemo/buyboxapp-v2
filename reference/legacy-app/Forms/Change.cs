using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace BuyBoxApp
{
    public partial class changePriceForm : Form
    {
        DataGridViewRow dataGridViewRow { get; }
        public changePriceForm(DataGridViewRow dataGridViewRow)
        {
            InitializeComponent();
            this.dataGridViewRow = dataGridViewRow;
        }
        private void changePriceForm_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Escape)
            {
                this.Close();
            }
        }
        private void changePriceForm_Load(object sender, EventArgs e)
        {
            assign_values();
        }
        private void assign_values()
        {
            var productCardInfo = JsonConvert.DeserializeObject<TrendyolAPI.FilterProducts.ProductCardInfo>(dataGridViewRow.Cells["Product_Json_Text"].Value.ToString());
            var content = productCardInfo.content[0];
            var buybox_Seller = JsonConvert.DeserializeObject<HAPParser.Seller>(dataGridViewRow.Cells["Buybox_Seller_Json"].Value.ToString());
            var other_Sellers = JsonConvert.DeserializeObject<List<HAPParser.Seller>>(dataGridViewRow.Cells["Other_Sellers_Json"].Value.ToString());
            txtBrand.Text = dataGridViewRow.Cells["Brand"].Value.ToString();
            txtCategory.Text = dataGridViewRow.Cells["Category"].Value.ToString();
            txtBarcode.Text = dataGridViewRow.Cells["Barcode"].Value.ToString();
            txtProductName.Text = dataGridViewRow.Cells["Product_Card_Name"].Value.ToString();
            txtUnitPrice.Text = double.Parse(dataGridViewRow.Cells["Product_Card_Unit_Price"].Value.ToString()).ToString("0.00");
            txtModelCode.Text = dataGridViewRow.Cells["Model_Code"].Value.ToString();
            txtSellerStockCode.Text = dataGridViewRow.Cells["Seller_Stock_Code"].Value.ToString();
            txtCommission.Text = dataGridViewRow.Cells["Commission"].Value.ToString();
            txtCommentCount.Text = dataGridViewRow.Cells["Product_Comment_Count"].Value.ToString();
            txtRatingCount.Text = dataGridViewRow.Cells["Product_Rating_Count"].Value.ToString();
            nmrcUDSellingPrice.Value = decimal.Parse(dataGridViewRow.Cells["Trendyol_Selling_Price"].Value.ToString());
            nmrcUDSellingStock.Value = Convert.ToInt32(dataGridViewRow.Cells["Selling_Stock"].Value.ToString());
            txtLowestSellablePrice.Text = Convert.ToDouble(dataGridViewRow.Cells["Lowest_Sellable_Price"].Value).ToString("0.00");
            txtUnitTotalStock.Text = dataGridViewRow.Cells["Unit_Total_Stock"].Value.ToString();
            txtBuyBoxSeller.Text = dataGridViewRow.Cells["BuyBox_Seller_Name"].Value.ToString();
            txtBuyBoxPrice.Text = ((double)dataGridViewRow.Cells["BuyBox_Seller_Price"].Value).ToString("0.00");
            txt_Buybox_Selling_Stock.Text = buybox_Seller != null ? buybox_Seller.selling_Stock.ToString() : "Satıcı Yok!";
            txt_Bb_Seller_Rating.Text = buybox_Seller != null ? buybox_Seller.rating.ToString("0.0") : "Satıcı yok!";
            txt_Bb_Sllr_Promtn.Text = buybox_Seller == null ? "Satıcı yok!" : buybox_Seller.has_Promotion ? buybox_Seller.promotions[0] : "Promosyon yok!";
            txt_Basket_Dsc.Text = buybox_Seller == null ? "Satıcı yok!" : buybox_Seller.has_Basket_Discount ? buybox_Seller.basket_Discount : "Sepet indirimi yok!";
            txtPriceDifference.Text = ((double)dataGridViewRow.Cells["BuyBox_Price_Difference"].Value).ToString("0.00");
            if (other_Sellers != null && other_Sellers.Count >= 1)
            {
                txt_Second_Seller.Text = dataGridViewRow.Cells["Second_Seller_Name"].Value.ToString();
                txt_Second_Seller_Price.Text = Convert.ToDouble(dataGridViewRow.Cells["Second_Seller_Price"].Value).ToString("0.00");
                txt_Second_Seller_Pd.Text = ((double)dataGridViewRow.Cells["Second_Seller_Price_Difference"].Value).ToString("0.00");
                txt_Second_Seller_Rtng.Text = other_Sellers[0].rating.ToString("0.0");
                txt_Second_Seller_Promtn.Text = other_Sellers[0].has_Promotion ? other_Sellers[0].promotions[0] : "Promosyon yok!";
                txt_Secnd_Basct_Dsc.Text = other_Sellers[0].has_Basket_Discount ? other_Sellers[0].basket_Discount : "Sepet indirimi yok!";
            }
            if (other_Sellers != null && other_Sellers.Count >= 2)
            {
                txt_Thrd_Sllr.Text = dataGridViewRow.Cells["Third_Seller_Name"].Value.ToString();
                txt_Thrd_Sllr_Prc.Text = Convert.ToDouble(dataGridViewRow.Cells["Third_Seller_Price"].Value).ToString("0.00");
                txt_Thr_Sllr_PD.Text = (decimal.Parse(txt_Thrd_Sllr_Prc.Text) - nmrcUDSellingPrice.Value).ToString("0.00");
                txt_Thrd_Sllr_Rtng.Text = other_Sellers[1].rating.ToString("0.0");
                txt_Thrd_Promtn.Text = other_Sellers[1].has_Promotion ? other_Sellers[1].promotions[0] : "Promosyon yok!";
                txt_Thrd_Bsct_Dsc.Text = other_Sellers[1].has_Basket_Discount ? other_Sellers[1].basket_Discount : "Sepet indirimi yok!";
            }
            if (other_Sellers != null && other_Sellers.Count >= 3)
            {
                txt_Frth_Sllr.Text = dataGridViewRow.Cells["Fourth_Seller_Name"].Value.ToString();
                txt_Frth_Sllr_Prc.Text = Convert.ToDouble(dataGridViewRow.Cells["Fourth_Seller_Price"].Value).ToString("0.00");
                txt_Frth_Sllr_PD.Text = (decimal.Parse(txt_Frth_Sllr_Prc.Text) - nmrcUDSellingPrice.Value).ToString("0.00");
                txt_Frth_Sllr_Rtng.Text = other_Sellers[2].rating.ToString("0.0");
                txt_Frth_Sllr_Promtn.Text = other_Sellers[2].has_Promotion ? other_Sellers[2].promotions[0] : "Promosyon yok!";
                txt_Frth_Sllr_Bsct_Dsc.Text = other_Sellers[2].has_Basket_Discount ? other_Sellers[2].basket_Discount : "Sepet indirimi yok!";
            }
            if (other_Sellers != null && other_Sellers.Count >= 4)
            {
                txt_Fifth_Sllr.Text = dataGridViewRow.Cells["Fifth_Seller_Name"].Value.ToString();
                txt_Fifth_Sllr_Prc.Text = Convert.ToDouble(dataGridViewRow.Cells["Fifth_Seller_Price"].Value).ToString("0.00");
                txt_Fifth_Sllr_PD.Text = (decimal.Parse(txt_Fifth_Sllr_Prc.Text) - nmrcUDSellingPrice.Value).ToString("0.00");
                txt_Fifth_Sllr_Rtng.Text = other_Sellers[3].rating.ToString("0.0");
                txt_Fifth_Sllr_Promtn.Text = other_Sellers[3].has_Promotion ? other_Sellers[3].promotions[0] : "Promosyon yok!";
                txt_Fifth_Sllr_Bsct_Dsc.Text = other_Sellers[3].has_Basket_Discount ? other_Sellers[3].basket_Discount : "Sepet indirimi yok!";
            }
            txt_Avg_Price.Text = dataGridViewRow.Cells["Average_Selling_Price"].Value.ToString();
            txt_Prdct_Cntn_Id.Text = dataGridViewRow.Cells["Product_Content_Id"].Value.ToString();
            txt_Last_DB_Updt.Text = dataGridViewRow.Cells["Last_Update_Date"].Value.ToString();
            txt_Brand_Id.Text = content.brandId.ToString();
            txt_Prdct_Cntn_Id.Text = content.productContentId.ToString();
            txt_Cmpgn_Strt.Text = DateTimeOffset.FromUnixTimeMilliseconds(content.campaignStartDate).ToLocalTime().ToString("dd.MM.yyyy HH:mm");
            txt_Cmpgn_Max_Prc.Text = content.campaignMaxPrice.ToString("0.00");
            txt_Cmpgn_End.Text = DateTimeOffset.FromUnixTimeMilliseconds(content.campaignEndDate).ToLocalTime().ToString("dd.MM.yyyy HH:mm");
            txt_Last_DB_Updt.Text = dataGridViewRow.Cells["Last_Update_Date"].Value.ToString();
            txt_Create_Datetime.Text = DateTimeOffset.FromUnixTimeMilliseconds(content.createDateTime).ToLocalTime().ToString("dd.MM.yyyy HH:mm");
            txt_lst_Prc_Upd.Text = DateTimeOffset.FromUnixTimeMilliseconds(content.lastPriceChangeDate).ToLocalTime().ToString("dd.MM.yyyy HH:mm");
            txt_Lst_Stk_Upd.Text = DateTimeOffset.FromUnixTimeMilliseconds(content.lastStockChangeDate).ToLocalTime().ToString("dd.MM.yyyy HH:mm");
            txt_Last_TY_Upd.Text = DateTimeOffset.FromUnixTimeMilliseconds(content.lastUpdateDate).ToLocalTime().ToString("dd.MM.yyyy HH:mm");
            txt_Reject_Details.Text = content.rejectReasonDetails.Count != 0 ? content.rejectReasonDetails[0].ToString() : string.Empty;
            txt_Ctgr_Min_Prc.Text = content.categoryMinPrice.ToString("0.00");
            txt_Ctgr_Max_Prc.Text = content.categoryMaxPrice.ToString("0.00");
            txt_Vat_Rate.Text = content.vatRate.ToString();
            txt_Unit_Stock_Type.Text = content.stockUnitType;
            chckbx_Has_ActCmp.Checked = content.hasActiveCampaign;
            chckbx_Approved.Checked = content.approved;
            chckBlacklisted.Checked = Convert.ToBoolean(dataGridViewRow.Cells["Blacklisted"].Value);
            chckInBuyBox.Checked = Convert.ToBoolean(dataGridViewRow.Cells["In_BuyBox"].Value);
            chckOnSale.Checked = Convert.ToBoolean(dataGridViewRow.Cells["On_Sale"].Value);
            chckUnderLowestSellablePrice.Checked = Convert.ToBoolean(dataGridViewRow.Cells["Under_Lowest_Sellable_Price"].Value);
            chckStockClosed.Checked = Convert.ToBoolean(dataGridViewRow.Cells["Stock_Out"].Value);
            chckMainProductCard.Checked = Convert.ToBoolean(dataGridViewRow.Cells["Main_Product_Card"].Value);
            chckbx_Rejected.Checked = Convert.ToBoolean(dataGridViewRow.Cells["Rejected"].Value);
            chckbx_Locked.Checked = Convert.ToBoolean(dataGridViewRow.Cells["Locked"].Value);
            pbProductPicture.ImageLocation = content.images[0].url;
        }
    }
}
