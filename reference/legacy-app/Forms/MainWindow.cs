using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Windows.Forms;

namespace BuyBoxApp
{
    public partial class MainWindow : Form
    {
        int bw1_progress = 0;
        int bw2_progress = 0;
        int bw_refresh_current_grid_progress = 0;
        int bw_refresh_current_grid2_progress = 0;
        static readonly string store_name = "farmaucuz";
        static bool get_buybox_activated = true;
        static int unit_stock_threshold = 1;
        private bool settingsImported;
        private List<string> skuList;
        private byte buyboxOrderMaxCount;


        public MainWindow()
        {
            InitializeComponent();
            
        }
        private void Form1_Load(object sender, EventArgs e)
        {
            if (!settingsImported) ImportSettings();
            Applications.TyProduct_Card_Table = new DataTable();
            Applications.HbProductCardTable = new DataTable();
            Applications.Stock_Table = new DataTable();
            FillTables();
            dgv_Stock_Table.Sort(dgv_Stock_Table.Columns["UnitStock"], System.ComponentModel.ListSortDirection.Descending);
            dgv_TyProduct_Card_Table.Sort(dgv_TyProduct_Card_Table.Columns["Product_Rating_Count"], System.ComponentModel.ListSortDirection.Descending);
            if(dgvHbProductCardTable.Rows.Count > 0) dgvHbProductCardTable.Sort(dgvHbProductCardTable.Columns["MerchantSku"], System.ComponentModel.ListSortDirection.Ascending);
            txt_SPCC.Text = dgv_TyProduct_Card_Table.Rows.Count.ToString();
            txtHbShownProductCardCount.Text = dgvHbProductCardTable.Rows.Count.ToString();
            this.FormBorderStyle = FormBorderStyle.Fixed3D;
            this.WindowState = FormWindowState.Maximized;
            chckbx_Get_Buybox_Activated.Checked = true;
        }
        private void ImportSettings()
        {
            // TODO : Make these unhardcoded
            skuList = new List<string>();
            buyboxOrderMaxCount = 10;

            settingsImported = true;
        }
        private void denemeToolStripMenuItem_Click(object sender, EventArgs e)
        {
            //MarketPlaces.Farmazon.GetListings();
            //MarketPlaces.HepsiBurada.Trial_Codes();
            //AutomateWorks.HBAutoBB.TrialCodes();
            //MarketPlaces.Farmazon.GetSoldOrders();
            //MarketPlaces.HepsiBurada.Trial_Codes();




        }
        private void Fill_Stock_Table()
        {
            SQLFunctions.Fill_Stock_Table();
            Action action = () =>
            {
                bindingSource_Stock_Table.DataSource = Applications.Stock_Table;
                bindingSource_Stock_Table.ResetBindings(false);
            };
            dgv_Stock_Table.Invoke(action);
        }
        private void Fill_Product_Card_Table()
        {
            SQLFunctions.Fill_Product_Card_Table();
            Action action = () =>
            {
                bindingSource_TyProduct_Card_Table.DataSource = Applications.TyProduct_Card_Table;
                bindingSource_TyProduct_Card_Table.ResetBindings(false);
                txt_SPCC.Text = dgv_TyProduct_Card_Table.Rows.Count.ToString();
            };
            txt_SPCC.Invoke(action);
        }
        private void FillHbProductCardTable()
        {
            Database.HepsiBuradaMySql.FillHbProductCardTable();
            Action action = () =>
            {
                bindingSourceHbProductCardTable.DataSource = Applications.HbProductCardTable;
                bindingSourceHbProductCardTable.ResetBindings(true);
                txtHbShownProductCardCount.Text = dgvHbProductCardTable.Rows.Count.ToString();
            };
            txtHbShownProductCardCount.Invoke(action);
        }
        private void btn_Refresh_Stocks_Click(object sender, EventArgs e)
        {
            bw_stk_rfrshr.RunWorkerAsync();
        }
        private void getProductListToolStripMenuItem_Click(object sender, EventArgs e)
        {
            Fill_Product_Card_Table();
        }
        private void SelectStockFileToolStripMenuItem_Click(object sender, EventArgs e)
        {
            bool fileOpened = FileFunctions.openStockFile();
            if (fileOpened)
            {
                selectStockFileToolStripMenuItem.Checked = true;
                btn_Refresh_Stocks.Enabled = true;
            }
        }
        private void selectProductFileToolStripMenuItem_Click(object sender, EventArgs e)
        {
            bool fileOpened = FileFunctions.openUnitFile();
            if (fileOpened)
            {
                selectProductFileToolStripMenuItem.Checked = true;
                RefreshProductCardsToolStripMenuItem.Enabled = true;
                btn_refresh_database.Enabled = true;
            }
            else
            {
                MessageBox.Show("Excel Tablosu açılamadı!!","Hata",MessageBoxButtons.OK,MessageBoxIcon.Error);
            }
        }
        private void RefreshProductCardsToolStripMenuItem_Click(object sender, EventArgs e)
        {
            bw_Product_Card_Refresher1.RunWorkerAsync();
            bw_Product_Card_Refresher2.RunWorkerAsync();
        }
        private void show_Product_Cards_DClick(object sender, DataGridViewCellEventArgs e)
        {
            if (e.RowIndex >= 0)
            {
                search_Products_FromStock();
            }
        }
        private void search_Products_FromStock()
        {
            string stock_Code = dgv_Stock_Table.CurrentRow.Cells["StockCode"].Value.ToString();
            bindingSource_TyProduct_Card_Table.Filter = string.Format("Seller_Stock_Code LIKE '*{0}*'", stock_Code);
            if(dgvHbProductCardTable.Rows.Count > 0) if(dgvHbProductCardTable.Rows.Count > 0) bindingSourceHbProductCardTable.Filter = string.Format("MerchantSku LIKE '*{0}*'", stock_Code);
            dgv_TyProduct_Card_Table.Sort(dgv_TyProduct_Card_Table.Columns["Product_Rating_Count"], System.ComponentModel.ListSortDirection.Descending);
            if (dgvHbProductCardTable.Rows.Count > 0) dgvHbProductCardTable.Sort(dgvHbProductCardTable.Columns["MerchantSku"], System.ComponentModel.ListSortDirection.Ascending);
            txt_SPCC.Text = dgv_TyProduct_Card_Table.Rows.Count.ToString();
            txtHbShownProductCardCount.Text = dgvHbProductCardTable.Rows.Count.ToString();
        }
        private void dgvStocks_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter)
            {
                search_Products_FromStock();
                e.SuppressKeyPress = true;
            }

        }
        private void refreshCurrentGridToolStripMenuItem_Click(object sender, EventArgs e)
        {
            Start_refresh_current_grid();
        }
        private void dgvProductCards_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.F5)
            {
                Start_refresh_current_grid();
            }
            else if (e.KeyCode == Keys.F6)
            {
                new Thread(() =>
                {
                    var selectedRow = dgv_TyProduct_Card_Table.SelectedCells[0].OwningRow;
                    updateProduct(selectedRow);
                    Action action = () => txt_Actions_Done.AppendText("Tekli ürün yenileme işlemi bitti." + DateTime.Now.ToString() + Environment.NewLine);
                    txt_Actions_Done.Invoke(action);
                    dgv_TyProduct_Card_Table.Invoke(new Action(() => Fill_Product_Card_Table()));
                }).Start();
            }
        }
        private void dgvHbProductCardTable_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.F5)
            {
                RefreshHbCurrentGrid();
            }
            else if (e.KeyCode == Keys.F6)
            {
                var hbSku = dgvHbProductCardTable.SelectedRows[0].Cells["HepsiburadaSku"].Value.ToString();
                new Thread(new ThreadStart(() =>
                {

                })).Start();
            }
        }
        private void RefreshHbCurrentGrid()
        {
            if (!bwHbRefreshCurrentGrid1.IsBusy)
            {
                skuList.Clear();
                GetHbSkuListToRefresh();
                bwHbRefreshCurrentGrid1.RunWorkerAsync();
            }
            else
            {
                MessageBox.Show(Form.ActiveForm, "Şu anda çalışan başka bir işlem bulunmakta. Lütfen daha sonra tekrar deneyiniz!", "HATA", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        private void bwHbRefreshCurrentGrid1_DoWork(object sender, System.ComponentModel.DoWorkEventArgs e)
        {
            var hbSkuList = skuList.GetRange(0, skuList.Count);
            if (hbSkuList.Count != 0)
            {
                var getListingsList = new List<string>();
                for (int i = 0; i < hbSkuList.Count; i++)
                {
                    getListingsList.Add(hbSkuList[i]);
                    if (getListingsList.Count == buyboxOrderMaxCount)
                    {
                        MarketPlaces.HepsiBurada.GetListings(getListingsList);
                        getListingsList.Clear();
                    }
                }
                MarketPlaces.HepsiBurada.GetListings(getListingsList);
                getListingsList.Clear();
                var dataRowList = new List<DataRow>();
                foreach (var sku in hbSkuList)
                {
                    dataRowList.Add(Database.HepsiBuradaMySql.GetHBListing(sku));
                }
                var isSalableList =
                    from dataRow in dataRowList
                    where Convert.ToBoolean(dataRow["IsSalable"]) && Convert.ToBoolean(dataRow["AutoBBActive"])
                    select dataRow;
                var dataRowIsSalableList = isSalableList.ToList();
                for (int j = 0; j < dataRowIsSalableList.Count; j++)
                {
                    AutomateWorks.HBAutoBB.AutoChangePrice(dataRowIsSalableList[j]);
                }
                AutomateWorks.HBAutoBB.CommitChangesAndClearList();
            }
        }
        private void bwHbRefreshCurrentGrid1_RunWorkerCompleted(object sender, System.ComponentModel.RunWorkerCompletedEventArgs e)
        {
            if (e.Cancelled)
            {
                txt_Actions_Done.AppendText("Hepsiburada ürün yenileme işlemi kullanıcı tarafından durduruldu!" + DateTime.Now.ToString() + Environment.NewLine);
            }
            else
            {
                txt_Actions_Done.AppendText("Hepsiburada ürün yenileme işlemi başarıyla tamamlandı." + DateTime.Now.ToString() + Environment.NewLine);
            }
            FillHbProductCardTable();
        }

        private void GetHbSkuListToRefresh()
        {
            try
            {
                for (int i = 0; i < dgvHbProductCardTable.Rows.Count; i++)
                {
                    skuList.Add(dgvHbProductCardTable.Rows[i].Cells["HepsiburadaSku"].Value.ToString());
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("MainWindow", "GetHbSkuListToRefresh", exc);
            }
        }
        private void FillTables()
        {
            Fill_Stock_Table();
            Fill_Product_Card_Table();
            FillHbProductCardTable();

        }
        private void refresh_Stock_TableToolStripMenuItem_Click(object sender, EventArgs e)
        {
            Fill_Stock_Table();
        }
        private void refreshHbProductsToolStripMenuItem_Click(object sender, EventArgs e)
        {
            FillHbProductCardTable();
        }
        private void bw_Product_Card_Refresher1_DoWork(object sender, System.ComponentModel.DoWorkEventArgs e)
        {
            for (int i = 0; i < Applications.TyTable.Rows.Count / 2; i++)
            {
                var barcode = Applications.TyTable.Rows[i][1].ToString();
                var product_card_info = APIOperations.getProductCard(barcode);
                updateDatabase(barcode, product_card_info);
                bw_Product_Card_Refresher1.ReportProgress(i * 100 / (Applications.TyTable.Rows.Count / 2));
                if (bw_Product_Card_Refresher1.CancellationPending)
                {
                    e.Cancel = true;
                    return;
                }
            }
        }
        private void bw_Product_Card_Refresher1_ProgressChanged(object sender, System.ComponentModel.ProgressChangedEventArgs e)
        {
            bw1_progress = e.ProgressPercentage;
            prg_Rfrs_Prdct.Value = Math.Min(bw1_progress, bw2_progress);
        }
        private void bw_Product_Card_Refresher1_RunWorkerCompleted(object sender, System.ComponentModel.RunWorkerCompletedEventArgs e)
        {
            if (!e.Cancelled)
            {
                if (!bw_Product_Card_Refresher2.IsBusy)
                {
                    txt_Actions_Done.AppendText("BuyBox araması bitti!" + DateTime.Now.ToString() + Environment.NewLine);
                    bw_Product_Card_Refresher1.RunWorkerAsync();
                    bw_Product_Card_Refresher2.RunWorkerAsync();
                }
            }
            else
            {
                txt_Actions_Done.AppendText("İşlem kullanıcı tarafından durduruldu!" + DateTime.Now.ToString() + Environment.NewLine);
            }
            Fill_Product_Card_Table();
            prg_Rfrs_Prdct.Value = prg_Rfrs_Prdct.Minimum;
        }
        private void bw_Product_Card_Refresher2_DoWork(object sender, System.ComponentModel.DoWorkEventArgs e)
        {
            for (int i = Applications.TyTable.Rows.Count / 2; i < Applications.TyTable.Rows.Count; i++)
            {
                var barcode = Applications.TyTable.Rows[i][1].ToString();
                var product_card_info = APIOperations.getProductCard(barcode);
                updateDatabase(barcode, product_card_info);
                bw_Product_Card_Refresher2.ReportProgress((i - (Applications.TyTable.Rows.Count / 2)) * 100 / (Applications.TyTable.Rows.Count / 2));
                if (bw_Product_Card_Refresher2.CancellationPending)
                {
                    e.Cancel = true;
                    return;
                }
            }
        }
        private void bw_Product_Card_Refresher2_ProgressChanged(object sender, System.ComponentModel.ProgressChangedEventArgs e)
        {
            bw2_progress = e.ProgressPercentage;
            prg_Rfrs_Prdct.Value = Math.Min(bw1_progress, bw2_progress);
        }
        private void bw_Product_Card_Refresher2_RunWorkerCompleted(object sender, System.ComponentModel.RunWorkerCompletedEventArgs e)
        {
            if (!e.Cancelled)
            {
                if (!bw_Product_Card_Refresher1.IsBusy)
                {
                    txt_Actions_Done.AppendText("BuyBox araması bitti!" + DateTime.Now.ToString() + Environment.NewLine);
                    bw_Product_Card_Refresher1.RunWorkerAsync();
                    bw_Product_Card_Refresher2.RunWorkerAsync();
                }
            }
            else
            {
                txt_Actions_Done.AppendText("İşlem kullanıcı tarafından durduruldu!" + DateTime.Now.ToString() + Environment.NewLine);
            }
            Fill_Product_Card_Table();
            prg_Rfrs_Prdct.Value = prg_Rfrs_Prdct.Minimum;

        }
        private void cms_dgv_prdct_tbl_ItemClicked(object sender, ToolStripItemClickedEventArgs e)
        {
            var change_form = new changePriceForm(dgv_TyProduct_Card_Table.SelectedCells[0].OwningRow);
            change_form.ShowDialog(Form.ActiveForm);
        }
        private void bw_stk_rfrshr_DoWork(object sender, System.ComponentModel.DoWorkEventArgs e)
        {
            try
            {
                Action action = () => btn_Refresh_Stocks.Enabled = false;
                btn_Refresh_Stocks.Invoke(action);
                for (int i = 0; i < Applications.StockTable.Rows.Count; i++)
                {
                    SQLFunctions.updateOrInsertStocks(Applications.StockTable.Rows[i]);
                    bw_stk_rfrshr.ReportProgress(i * 100 / Applications.StockTable.Rows.Count);
                }
            }
            catch (Exception exc)
            {
                MessageBox.Show("Hata oluştu. Hata :" + exc.Message, "HATA", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        private void bw_stk_rfrshr_ProgressChanged(object sender, System.ComponentModel.ProgressChangedEventArgs e)
        {
            btn_Refresh_Stocks.Text = "Tablo Yenileniyor...";
            prgrs_refresh_stocks.Value = e.ProgressPercentage;
        }
        private void bw_stk_rfrshr_RunWorkerCompleted(object sender, System.ComponentModel.RunWorkerCompletedEventArgs e)
        {
            btn_Refresh_Stocks.Text = "Tablo Yenilendi.";
            Fill_Stock_Table();
            prgrs_refresh_stocks.Value = 0;
            btn_Refresh_Stocks.Enabled = true;
            new Thread(() =>
            {
                Thread.Sleep(3000);
                Action action = () => btn_Refresh_Stocks.Text = "Stokları Yenile";
                btn_Refresh_Stocks.Invoke(action);
            }).Start();
        }
        void updateDatabase(string barcode, TrendyolAPI.FilterProducts.ProductCardInfo productCardInfo)
        {
            try
            {
                var contentInfo = productCardInfo.content;
                int bottomStockLine = unit_stock_threshold;
                if (contentInfo.Count == 0)
                {
                    Action action = () => txt_Actions_Done.AppendText(string.Format("-{0}- barkoda sahip ürün yok, Atlanıyor...", barcode) + DateTime.Now.ToString() + Environment.NewLine);
                    txt_Actions_Done.Invoke(action);
                }
                else
                {
                    var content = contentInfo[0];
                    int unit_stock = content.title == "Error" ? -1 : SQLFunctions.getUnitStock(Functions.getBaseStockCode(content.stockCode));
                    if (unit_stock == -1)
                    {
                        Action action = () => txt_Actions_Done.AppendText(string.Format("-{0}- barkoda sahip üründe api hatası yaşandı, Atlanıyor...", content.barcode) + DateTime.Now.ToString() + Environment.NewLine);
                        txt_Actions_Done.Invoke(action);
                    }
                    else if (unit_stock < bottomStockLine)
                    {
                        Action action = () => txt_Actions_Done.AppendText(string.Format("-{0}- barkoda sahip ürünün stoğu yetersiz, Atlanıyor...", content.barcode) + DateTime.Now.ToString() + Environment.NewLine);
                        txt_Actions_Done.Invoke(action);
                    }
                    else
                    {
                        var productCard = createProductCard(productCardInfo);
                        var check_If_AutoBB = SQLFunctions.check_If_AutoBB(Functions.getBaseStockCode(productCard.sellerStockCode));
                        if (!productCard.errorOccurred)
                        {
                            change_Price(content, productCard, check_If_AutoBB);
                            SQLFunctions.updateOrInsert(productCard);
                            Action action = () => txt_Actions_Done.AppendText("Database Updated : -" + productCard.barcode + "-" + DateTime.Now.ToString() + Environment.NewLine);
                            txt_Actions_Done.Invoke(action);
                        }
                        else
                        {
                            Action action = () => txt_Actions_Done.AppendText("Hata Oluştu <PEO> : -" + productCard.barcode + "-" + DateTime.Now.ToString() + Environment.NewLine);
                            txt_Actions_Done.Invoke(action);
                        }
                    }
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("MainWindow", "updateDatabase", exc, barcode: barcode);
            }
        }
        private void btn_cancel_refresh_db_Click(object sender, EventArgs e)
        {
            if (bw_Product_Card_Refresher1.IsBusy || bw_Product_Card_Refresher2.IsBusy)
            {
                bw_Product_Card_Refresher1.CancelAsync();
                bw_Product_Card_Refresher2.CancelAsync();
            }
            else
            {
                MessageBox.Show("Çalışan arkaplan işçi parçacığı bulunamadı. İşlem başarısız!", "Başarısız!", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        private void bw_refresh_current_grid_DoWork(object sender, System.ComponentModel.DoWorkEventArgs e)
        {
            var currentRowBarcodeComms = GetBarcodeCommTupleList(0, dgv_TyProduct_Card_Table.Rows.Count / 2);
            if (currentRowBarcodeComms.Count > 0)
            {
                for (int j = 0; j < currentRowBarcodeComms.Count; j++)
                {
                    bw_refresh_current_grid.ReportProgress((j + 1) * 100 / currentRowBarcodeComms.Count);
                    updateProduct(currentRowBarcodeComms[j].Item1, currentRowBarcodeComms[j].Item2);
                    if (bw_refresh_current_grid.CancellationPending)
                    {
                        e.Cancel = true;
                        return;
                    }
                }
            }
        }
        private void bw_refresh_current_grid_ProgressChanged(object sender, System.ComponentModel.ProgressChangedEventArgs e)
        {
            bw_refresh_current_grid_progress = e.ProgressPercentage;
            int bwProgress_1 = bw_refresh_current_grid.IsBusy ? bw_refresh_current_grid_progress : 100;
            int bwProgress_2 = bw_refresh_current_grid2.IsBusy ? bw_refresh_current_grid2_progress : 100;
            prg_refresh_current_grid.Value = Math.Min(bwProgress_1, bwProgress_2);
        }
        private void bw_refresh_current_grid_RunWorkerCompleted(object sender, System.ComponentModel.RunWorkerCompletedEventArgs e)
        {
            if (!bw_refresh_current_grid2.IsBusy)
            {
                if (e.Cancelled)
                {
                    txt_Actions_Done.AppendText("İşlem kullanıcı tarafından durduruldu!" + DateTime.Now.ToString() + Environment.NewLine);
                }
                else
                {
                    txt_Actions_Done.AppendText("İşlem başarıyla tamamlandı." + DateTime.Now.ToString() + Environment.NewLine);
                }
                prg_refresh_current_grid.Value = 0;
                Fill_Product_Card_Table();
                bw_refresh_current_grid_progress = 0;
                bw_refresh_current_grid2_progress = 0;
                if(!e.Cancelled)
                {
                    bw_refresh_current_grid.RunWorkerAsync();
                    bw_refresh_current_grid2.RunWorkerAsync();
                }
            }
        }
        private void bw_refresh_current_grid2_DoWork(object sender, System.ComponentModel.DoWorkEventArgs e)
        {
            var currentRowBarcodeComms = GetBarcodeCommTupleList(dgv_TyProduct_Card_Table.Rows.Count / 2, dgv_TyProduct_Card_Table.Rows.Count);
            if (currentRowBarcodeComms.Count > 0)
            {
                for (int j = 0; j < currentRowBarcodeComms.Count; j++)
                {
                    bw_refresh_current_grid2.ReportProgress((j + 1) * 100 / currentRowBarcodeComms.Count);
                    updateProduct(currentRowBarcodeComms[j].Item1, currentRowBarcodeComms[j].Item2);
                    if (bw_refresh_current_grid2.CancellationPending)
                    {
                        e.Cancel = true;
                        return;
                    }
                }
            }
        }
        private void bw_refresh_current_grid2_ProgressChanged(object sender, System.ComponentModel.ProgressChangedEventArgs e)
        {
            bw_refresh_current_grid2_progress = e.ProgressPercentage;
            int bwProgress_1 = bw_refresh_current_grid.IsBusy ? bw_refresh_current_grid_progress : 100;
            int bwProgress_2 = bw_refresh_current_grid2.IsBusy ? bw_refresh_current_grid2_progress : 100;
            prg_refresh_current_grid.Value = Math.Min(bwProgress_1, bwProgress_2);
        }
        private void bw_refresh_current_grid2_RunWorkerCompleted(object sender, System.ComponentModel.RunWorkerCompletedEventArgs e)
        {
            if (!bw_refresh_current_grid.IsBusy)
            {
                if (e.Cancelled)
                {
                    txt_Actions_Done.AppendText("İşlem kullanıcı tarafından durduruldu!" + DateTime.Now.ToString() + Environment.NewLine);
                }
                else
                {
                    txt_Actions_Done.AppendText("İşlem başarıyla tamamlandı." + DateTime.Now.ToString() + Environment.NewLine);
                }
                prg_refresh_current_grid.Value = 0;
                bw_refresh_current_grid_progress = 0;
                bw_refresh_current_grid2_progress = 0;
                Fill_Product_Card_Table();
                if (!e.Cancelled)
                {
                    bw_refresh_current_grid.RunWorkerAsync();
                    bw_refresh_current_grid2.RunWorkerAsync();
                }
            }
        }
        private void btn_cancel_refresh_current_grid_Click(object sender, EventArgs e)
        {
            bw_refresh_current_grid.CancelAsync();
            bw_refresh_current_grid2.CancelAsync();
        }
        private List<(string, double)> GetBarcodeCommTupleList(int startIndex, int endIndex)
        {
            try
            {
                var listToReturn = new List<(string, double)>();
                for (int i = startIndex; i < endIndex; i++)
                {
                    listToReturn.Add((dgv_TyProduct_Card_Table.Rows[i].Cells["Barcode"].Value.ToString(), Convert.ToDouble(dgv_TyProduct_Card_Table.Rows[i].Cells["Commission"].Value)));
                }
                return listToReturn;
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("MainWindow", "GetBarcodeCommTupleList", exc);
                return new List<(string, double)>();
            }
        }
        private static void change_Price(TrendyolAPI.FilterProducts.ProductCardInfo.Content content, TYProductCard product_Card, bool? check_If_AutoBB)
        {
            if (check_If_AutoBB.HasValue)
            {
                if (check_If_AutoBB.Value)
                {
                    AutomateWorks.TYAutoBB.Get_Buybox(product_Card, content, get_buybox_activated);
                }
            }
        }
        public static void updateProduct(DataGridViewRow currentRow)
        {
            try
            {
                var product_Card_Api = APIOperations.getProductCard(currentRow.Cells["Barcode"].Value.ToString());
                var content = product_Card_Api.content[0];
                var product_Card = createProductCard(product_Card_Api,
                    commission: Convert.ToDouble(currentRow.Cells["Commission"].Value));
                var check_If_AutoBB = SQLFunctions.check_If_AutoBB(Functions.getBaseStockCode(product_Card.sellerStockCode));
                change_Price(content, product_Card, check_If_AutoBB);
                SQLFunctions.updateOrInsert(product_Card);
            }
            catch (Exception exc)
            {
                MessageBox.Show("Hata Oluştu. HATA :" + exc.Message, "HATA", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        public static void updateProduct(string barcode, double comm)
        {
            try
            {
                var product_Card_Api = APIOperations.getProductCard(barcode);
                if(product_Card_Api.content.Count == 0)  return;
                var content = product_Card_Api.content[0];
                var product_Card = createProductCard(product_Card_Api,
                    commission: comm);
                var check_If_AutoBB = SQLFunctions.check_If_AutoBB(Functions.getBaseStockCode(product_Card.sellerStockCode));
                change_Price(content, product_Card, check_If_AutoBB);
                SQLFunctions.updateOrInsert(product_Card);
            }
            catch (Exception exc)
            {
                MessageBox.Show("Hata Oluştu. HATA :" + exc.Message, "HATA", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        static TYProductCard createProductCard(TrendyolAPI.FilterProducts.ProductCardInfo productCards, double commission = -1)
        {

            IList<TrendyolAPI.FilterProducts.ProductCardInfo.Content> contents = productCards.content;
            TrendyolAPI.FilterProducts.ProductCardInfo.Content productCardInfo = contents[0];
            TYProductCard productCard = new TYProductCard
            {
                errorOccurred = true
            };
            try
            {
                if (productCardInfo.title != "Error")
                {
                    productCard.barcode = productCardInfo.barcode;
                    productCard.brand = productCardInfo.brand;
                    productCard.category = productCardInfo.categoryName;
                    productCard.modelCode = productCardInfo.productMainId;
                    productCard.productName = productCardInfo.title;
                    productCard.productContentId = productCardInfo.productContentId;
                    var parser = new HAPParser(productCard.productContentId, productCard.barcode);
                    productCard.productLink = parser.productLink;
                    productCard.sellerStockCode = productCardInfo.stockCode;
                    productCard.unitPrice = SQLFunctions.getUnitPrice(productCard.sellerStockCode);
                    productCard.original_unit_price = SQLFunctions.getUnitPrice(productCard.sellerStockCode, get_org_price: true);
                    productCard.mainProductCard = false;
                    productCard.commission = commission == -1 ? Functions.getCommission(productCard.barcode) : commission;
                    productCard.list_price = productCardInfo.listPrice;
                    productCard.trendyolSellingPrice = productCardInfo.salePrice;
                    productCard.lowestSellablePrice = Functions.calcMinPrice(productCard.unitPrice, productCard.commission);
                    productCard.buyBoxSeller = parser.buyBoxSeller;
                    productCard.other_Sellers = parser.other_Sellers;
                    productCard.second_Seller = productCard.other_Sellers == null || productCard.other_Sellers.Count == 0 ?
                        null : productCard.other_Sellers[0];
                    productCard.third_Seller = productCard.other_Sellers == null || productCard.other_Sellers.Count <= 1 ?
                        null : productCard.other_Sellers[1];
                    productCard.fourth_Seller = productCard.other_Sellers == null || productCard.other_Sellers.Count <= 2 ?
                        null : productCard.other_Sellers[2];
                    productCard.fifth_Seller = productCard.other_Sellers == null || productCard.other_Sellers.Count <= 3 ?
                        null : productCard.other_Sellers[3];
                    productCard.sellingStock = productCardInfo.quantity;
                    productCard.unitTotalStock = SQLFunctions.getUnitStock(productCard.sellerStockCode);
                    productCard.onSale = productCardInfo.onSale;
                    productCard.inBuyBox = parser.buyBoxSeller.name == store_name;
                    productCard.underLowestSellablePrice = productCard.trendyolSellingPrice < productCard.lowestSellablePrice ? true : false;
                    productCard.stock_Out = productCard.sellingStock == 0;
                    productCard.increase_price = SQLFunctions.Get_product_card_inc(productCard.barcode);
                    productCard.decrease_price = SQLFunctions.Get_product_card_decr(productCard.barcode);
                    productCard.commentCount = parser.productCommentCount;
                    productCard.ratingCount = parser.productRatingCount;
                    if (!parser.has_Other_Sellers)
                    {
                        productCard.priceDifferenceSecond = -1f;
                    }
                    else if (productCard.second_Seller.has_Basket_Discount)
                    {
                        productCard.priceDifferenceSecond = productCard.second_Seller.basket_Discount_Price - (productCard.buyBoxSeller.has_Basket_Discount ? productCard.buyBoxSeller.basket_Discount_Price : productCard.buyBoxSeller.selling_Price);

                    }
                    else
                    {
                        productCard.priceDifferenceSecond = productCard.second_Seller.selling_Price - productCard.trendyolSellingPrice;
                    }
                    if (!parser.has_BuyBox_Seller)
                    {
                        productCard.priceDifference = -1f;
                    }
                    else if (productCard.buyBoxSeller.has_Basket_Discount)
                    {
                        productCard.priceDifference = productCard.buyBoxSeller.basket_Discount_Price - productCard.trendyolSellingPrice;
                    }
                    else
                    {
                        productCard.priceDifference = productCard.buyBoxSeller.selling_Price - productCard.trendyolSellingPrice;
                    }
                    productCard.blackListed = productCardInfo.blacklisted;
                    productCard.product_json_text = Newtonsoft.Json.JsonConvert.SerializeObject(productCards);
                    productCard.last_Update_Date = DateTime.Now;
                    var temp_Price_List = new List<double>();
                    if (parser.has_BuyBox_Seller)
                    {
                        if (parser.buyBoxSeller.has_Basket_Discount)
                        {
                            temp_Price_List.Add(productCard.buyBoxSeller.basket_Discount_Price);
                        }
                    }
                    if (parser.has_Other_Sellers)
                    {
                        foreach (var seller in productCard.other_Sellers)
                        {
                            if (seller.has_Basket_Discount)
                            {
                                temp_Price_List.Add(seller.basket_Discount_Price);
                            }
                            else
                            {
                                temp_Price_List.Add(seller.selling_Price);
                            }
                        }
                    }
                    temp_Price_List.RemoveAll(item => item == -1f);
                    if (temp_Price_List.Count != 0)
                    {

                        productCard.average_Price = temp_Price_List.Average();
                    }
                    else
                    {
                        productCard.average_Price = -1f;
                    }
                    productCard.errorOccurred = false;
                }
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("MainWindow", "createProductCard", exc, barcode: productCardInfo.barcode);
            }
            return productCard;
        }
        private void dgv_Stock_Table_CellEndEdit(object sender, DataGridViewCellEventArgs e)
        {
            try
            {
                if (e.ColumnIndex == dgv_Stock_Table.Columns["SpecialPriceMultiplier"].Index)
                {
                    SQLFunctions.edit_special_price_multiplier(dgv_Stock_Table.Rows[e.RowIndex].Cells["StockCode"].Value.ToString(), Convert.ToSingle(dgv_Stock_Table.Rows[e.RowIndex].Cells["SpecialPriceMultiplier"].Value));
                }
                else if (e.ColumnIndex == dgv_Stock_Table.Columns["TyAutomatedBuybox"].Index)
                {
                    SQLFunctions.edit_AutoBB(dgv_Stock_Table.Rows[e.RowIndex].Cells["StockCode"].Value.ToString(), (bool)dgv_Stock_Table.Rows[e.RowIndex].Cells["TyAutomatedBuybox"].Value);
                }
                else if (e.ColumnIndex == dgv_Stock_Table.Columns["HbAutomatedBuybox"].Index)
                {
                    Database.HepsiBuradaMySql.EditAutoBB(dgv_Stock_Table.Rows[e.RowIndex].Cells["StockCode"].Value.ToString(), Convert.ToBoolean(dgv_Stock_Table.Rows[e.RowIndex].Cells["HbAutomatedBuybox"].Value));
                }
                else if (e.ColumnIndex == dgv_Stock_Table.Columns["HbSpecialPriceMultiplier"].Index)
                {
                    Database.HepsiBuradaMySql.EditSpecialPriceMultiplier(dgv_Stock_Table.Rows[e.RowIndex].Cells["StockCode"].Value.ToString(), Convert.ToDouble(dgv_Stock_Table.Rows[e.RowIndex].Cells["HbSpecialPriceMultiplier"].Value));
                }
            }
            catch (Exception exc)
            {
                MessageBox.Show(Form.ActiveForm, "Hata :" + exc.Message, "Değer Değiştirilemedi!", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        private void txt_Search_Stock_Name_TextChanged(object sender, EventArgs e)
        {
            bindingSource_Stock_Table.Filter = "ProductName LIKE '%" + txt_Search_Stock_Name.Text.Trim() + "%'";
        }
        private void txt_Search_Stock_Code_TextChanged(object sender, EventArgs e)
        {
            bindingSource_Stock_Table.Filter = "StockCode LIKE '%" + txt_Search_Stock_Code.Text.Trim() + "%'";
        }
        private void Filter_Changed(object sender, EventArgs e)
        {
            Filter_Product_Cards();
        }
        private void NUD_Value_Changed(object sender, EventArgs e)
        {
            Filter_Product_Cards();
        }
        private void Filter_Checkbox_Changed(object sender, EventArgs e)
        {
            Filter_Product_Cards();
        }
        private void Filter_Product_Cards()
        {
            bindingSource_TyProduct_Card_Table.Filter = "Barcode LIKE '%" + txt_Barcode.Text.Trim() + "%' AND " +
                "Product_Card_Name LIKE '%" + txt_Product_name.Text.Trim() + "%' AND " +
                "Brand LIKE '%" + txt_Brand.Text.Trim() + "%' AND " +
                "Category LIKE '%" + txt_Category.Text.Trim() + "%' AND " +
                "Seller_Stock_Code LIKE '%" + txt_Sllr_Stck_Code.Text.Trim() + "%'";
            if(dgvHbProductCardTable.Rows.Count > 0) bindingSourceHbProductCardTable.Filter = "HepsiburadaSku LIKE '%" + txt_Barcode.Text.Trim() + "%' AND " +
                "MerchantSku LIKE '%" + txt_Sllr_Stck_Code.Text.Trim() + "%'";
            if (cmbbx_Cmssion.SelectedIndex != -1)
            {
                bindingSource_TyProduct_Card_Table.Filter += " AND Commission " + cmbbx_Cmssion.Text + " " + nud_Cmssion.Value;
                if(dgvHbProductCardTable.Rows.Count > 0) bindingSourceHbProductCardTable.Filter += " AND CommissionRate " + cmbbx_Cmssion.Text + " " + nud_Cmssion.Value;
            }
            if (cmbbx_Selling_Stock.SelectedIndex != -1)
            {
                bindingSource_TyProduct_Card_Table.Filter += " AND Selling_Stock " + cmbbx_Selling_Stock.Text + " " + nud_Sllng_Stck.Value;
                if(dgvHbProductCardTable.Rows.Count > 0) bindingSourceHbProductCardTable.Filter += " AND AvailableStock " + cmbbx_Selling_Stock.Text + " " + nud_Sllng_Stck.Value;
            }
            if (cmbbx_Total_Stock.SelectedIndex != -1)
            {
                bindingSource_TyProduct_Card_Table.Filter += " AND Unit_Total_Stock " + cmbbx_Total_Stock.Text + " " + nud_Total_Stock.Value;
            }
            if (chckbx_Can_Get_Buybox.Enabled)
            {
                if (chckbx_Can_Get_Buybox.Checked)
                {
                    bindingSource_TyProduct_Card_Table.Filter += " AND Lowest_Sellable_Price <= BuyBox_Seller_Price";
                }
                else
                {
                    bindingSource_TyProduct_Card_Table.Filter += " AND Lowest_Sellable_Price > BuyBox_Seller_Price";
                }
            }
            if (chckbx_Selling_At_Loss.Enabled)
            {
                if (chckbx_Selling_At_Loss.Checked)
                {
                    bindingSource_TyProduct_Card_Table.Filter += " AND Lowest_Sellable_Price > Trendyol_Selling_Price";
                    if(dgvHbProductCardTable.Rows.Count > 0) bindingSourceHbProductCardTable.Filter += " AND LowestSellablePrice > Price";
                }
                else
                {
                    bindingSource_TyProduct_Card_Table.Filter += " AND Lowest_Sellable_Price <= Trendyol_Selling_Price";
                    if(dgvHbProductCardTable.Rows.Count > 0) bindingSourceHbProductCardTable.Filter += " AND LowestSellablePrice <= Price";
                }
            }
            if (chckbx_Blacklisted.Enabled)
            {
                if (chckbx_Blacklisted.Checked)
                {
                    bindingSource_TyProduct_Card_Table.Filter += " AND Blacklisted = 1";
                    if(dgvHbProductCardTable.Rows.Count > 0) bindingSourceHbProductCardTable.Filter += " AND IsLocked = 1";
                }
                else
                {
                    bindingSource_TyProduct_Card_Table.Filter += " AND Blacklisted = 0";
                    if(dgvHbProductCardTable.Rows.Count > 0) bindingSourceHbProductCardTable.Filter += "  AND IsLocked = 0";
                }
            }
            if (chckbx_In_Buybox.Enabled)
            {
                if (chckbx_In_Buybox.Checked)
                {
                    bindingSource_TyProduct_Card_Table.Filter += " AND In_Buybox = 1";
                }
                else
                {
                    bindingSource_TyProduct_Card_Table.Filter += " AND In_Buybox = 0";
                }
            }
            if (chckbx_At_List_Price.Enabled)
            {
                if (chckbx_At_List_Price.Checked)
                {
                    bindingSource_TyProduct_Card_Table.Filter += " AND Trendyol_Selling_Price = List_Price";
                }
                else
                {
                    bindingSource_TyProduct_Card_Table.Filter += " AND Trendyol_Selling_Price <> List_Price";
                }
            }
            txt_SPCC.Text = dgv_TyProduct_Card_Table.Rows.Count.ToString();
            txtHbShownProductCardCount.Text = dgvHbProductCardTable.Rows.Count.ToString();
        }
        private void btn_Clear_Filter_Click(object sender, EventArgs e)
        {
            bindingSource_TyProduct_Card_Table.RemoveFilter();
            bindingSourceHbProductCardTable.RemoveFilter();
            cmbbx_Cmssion.SelectedIndex = -1;
            cmbbx_Selling_Stock.SelectedIndex = -1;
            cmbbx_Total_Stock.SelectedIndex = -1;
            txt_Barcode.Text = string.Empty;
            txt_Brand.Text = string.Empty;
            txt_Category.Text = string.Empty;
            txt_Product_name.Text = string.Empty;
            txt_Sllr_Stck_Code.Text = string.Empty;
            nud_Cmssion.Value = 0;
            nud_Sllng_Stck.Value = 0;
            nud_Total_Stock.Value = 0;
            chckbx_Can_Get_Buybox.Checked = false;
            chckbx_CGB_Enabled.Checked = false;
            chckbx_Selling_At_Loss.Checked = false;
            chckbx_SAL_Enabled.Checked = false;
            chckbx_Blacklisted.Checked = false;
            chckbx_Blacklisted_Enabled.Checked = false;
            chckbx_In_Buybox.Checked = false;
            chckbx_InBuybox_Enabled.Checked = false;
            chckbx_ALP_Enabled.Checked = false;
            chckbx_At_List_Price.Checked = false;
            txt_SPCC.Text = dgv_TyProduct_Card_Table.Rows.Count.ToString();
            txtHbShownProductCardCount.Text = dgvHbProductCardTable.Rows.Count.ToString();
        }
        private void chckbx_CGB_Enabled_CheckedChanged(object sender, EventArgs e)
        {
            chckbx_Can_Get_Buybox.Enabled = chckbx_CGB_Enabled.Checked;
        }
        private void chckbx_SAL_Enabled_CheckedChanged(object sender, EventArgs e)
        {
            chckbx_Selling_At_Loss.Enabled = chckbx_SAL_Enabled.Checked;
        }
        private void chckbx_Blacklisted_Enabled_CheckedChanged(object sender, EventArgs e)
        {
            chckbx_Blacklisted.Enabled = chckbx_Blacklisted_Enabled.Checked;
        }
        private void chckbx_InBuybox_Enabled_CheckedChanged(object sender, EventArgs e)
        {
            chckbx_In_Buybox.Enabled = chckbx_InBuybox_Enabled.Checked;
        }
        private void chckbx_ALP_Enabled_CheckedChanged(object sender, EventArgs e)
        {
            chckbx_At_List_Price.Enabled = chckbx_ALP_Enabled.Checked;
        }
        private void dgv_Product_Card_Table_CellEndEdit(object sender, DataGridViewCellEventArgs e)
        {
            if (e.ColumnIndex == dgv_TyProduct_Card_Table.Columns["Increase_Price"].Index)
            {
                bool changed_value = dgv_TyProduct_Card_Table.Rows[e.RowIndex].Cells[e.ColumnIndex].Value != DBNull.Value;
                SQLFunctions.Edit_product_card_inc(dgv_TyProduct_Card_Table.Rows[e.RowIndex].Cells["Barcode"].Value.ToString(), changed_value);
            }
            if (e.ColumnIndex == dgv_TyProduct_Card_Table.Columns["Decrease_Price"].Index)
            {
                bool changed_value = dgv_TyProduct_Card_Table.Rows[e.RowIndex].Cells[e.ColumnIndex].Value != DBNull.Value;
                SQLFunctions.Edit_product_card_decr(dgv_TyProduct_Card_Table.Rows[e.RowIndex].Cells["Barcode"].Value.ToString(), changed_value);
            }
            if (e.ColumnIndex == dgv_TyProduct_Card_Table.Columns["Trendyol_Selling_Price"].Index)
            {
                new Thread(() =>
                {
                    try
                    {
                        var updated_price = Convert.ToDouble(dgv_TyProduct_Card_Table.Rows[e.RowIndex].Cells["Trendyol_Selling_Price"].Value);
                        var barcode = dgv_TyProduct_Card_Table.Rows[e.RowIndex].Cells["Barcode"].Value.ToString();
                        var product_card_content = APIOperations.getProductCard(barcode).content[0];
                        APIOperations.Update_price(updated_price, product_card_content);
                    }
                    catch (Exception)
                    {
                        MessageBox.Show("HATA", "Bir hata oluştu, fiyat güncellenemedi!", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }).Start();
            }
            if (e.ColumnIndex == dgv_TyProduct_Card_Table.Columns["Selling_Stock"].Index)
            {
                new Thread(() =>
                {
                    try
                    {
                        var updated_stock = Convert.ToInt32(dgv_TyProduct_Card_Table.Rows[e.RowIndex].Cells["Selling_Stock"].Value);
                        var barcode = dgv_TyProduct_Card_Table.Rows[e.RowIndex].Cells["Barcode"].Value.ToString();
                        var product_card_content = APIOperations.getProductCard(barcode).content[0];
                        APIOperations.Update_Quantity(updated_stock, product_card_content);
                    }
                    catch (Exception)
                    {
                        MessageBox.Show("HATA", "Bir hata oluştu, stok güncellenemedi!", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }).Start();
            }
            if (e.ColumnIndex == dgv_TyProduct_Card_Table.Columns["List_Price"].Index)
            {
                new Thread(() =>
                {
                    try
                    {
                        var updatedListPrice = Convert.ToInt32(dgv_TyProduct_Card_Table.Rows[e.RowIndex].Cells["List_Price"].Value);
                        var barcode = dgv_TyProduct_Card_Table.Rows[e.RowIndex].Cells["Barcode"].Value.ToString();
                        var product_card_content = APIOperations.getProductCard(barcode).content[0];
                        APIOperations.Update_list_price(updatedListPrice, product_card_content);
                    }
                    catch (Exception)
                    {
                        MessageBox.Show("HATA", "Bir hata oluştu, psf güncellenemedi!", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }).Start();
            }
        }
        private void chckbx_Get_Buybox_Activated_CheckedChanged(object sender, EventArgs e)
        {
            get_buybox_activated = chckbx_Get_Buybox_Activated.Checked;
        }
        private void btn_refresh_current_grid_Click(object sender, EventArgs e)
        {
            Start_refresh_current_grid();
        }
        private void Start_refresh_current_grid()
        {
            if (dgv_TyProduct_Card_Table.Rows.Count > 0)
            {
                if (!bw_refresh_current_grid.IsBusy && !bw_refresh_current_grid2.IsBusy)
                {
                    bw_refresh_current_grid.RunWorkerAsync();
                    bw_refresh_current_grid2.RunWorkerAsync();
                }
                else
                {
                    MessageBox.Show("Zaten bir yenileme işlemi gerçekleşiyor. Lütfen bekleyiniz!", "HATA", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }
        private void dgvHbProductCardTable_CellEndEdit(object sender, DataGridViewCellEventArgs e)
        {
            if (e.ColumnIndex == dgvHbProductCardTable.Columns["AvailableStock"].Index || e.ColumnIndex == dgvHbProductCardTable.Columns["Price"].Index)
            {
                new Thread(() =>
                {
                    try
                    {
                        var hbProduct = new
                        {
                            hepsiburadaSku = dgvHbProductCardTable.Rows[e.RowIndex].Cells["HepsiburadaSku"].Value.ToString(),
                            merchantSku = dgvHbProductCardTable.Rows[e.RowIndex].Cells["MerchantSku"].Value.ToString(),
                            productName = string.Empty,
                            price = Convert.ToDouble(dgvHbProductCardTable.Rows[e.RowIndex].Cells["Price"].Value),
                            availableStock = Convert.ToUInt16(dgvHbProductCardTable.Rows[e.RowIndex].Cells["AvailableStock"].Value),
                            dispatchTime = Convert.ToByte(dgvHbProductCardTable.Rows[e.RowIndex].Cells["DispatchTime"].Value),
                            maximumPurchasableQuantity = Convert.ToByte(dgvHbProductCardTable.Rows[e.RowIndex].Cells["MaximumPurchasableQuantity"].Value),
                            cargoCompany1 = dgvHbProductCardTable.Rows[e.RowIndex].Cells["CargoCompany1"].Value.ToString(),
                            cargoCompany2 = dgvHbProductCardTable.Rows[e.RowIndex].Cells["CargoCompany2"].Value.ToString(),
                            cargoCompany3 = dgvHbProductCardTable.Rows[e.RowIndex].Cells["CargoCompany3"].Value.ToString()
                        };
                        var listingToken = Newtonsoft.Json.Linq.JObject.Parse(Newtonsoft.Json.JsonConvert.SerializeObject(hbProduct));
                        var listingTokenList = new List<Newtonsoft.Json.Linq.JToken> { listingToken };
                        MarketPlaces.HepsiBurada.UpdateListings(listingTokenList);
                    }
                    catch (Exception)
                    {
                        MessageBox.Show(Form.ActiveForm, "HATA", "Bir hata oluştu, stok güncellenemedi!", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }).Start();
            }
            else if (e.ColumnIndex == dgvHbProductCardTable.Columns["IncreasePrice"].Index)
            {
                Database.HepsiBuradaMySql.EditIncreasePrice(dgvHbProductCardTable.Rows[e.RowIndex].Cells["HepsiburadaSku"].Value.ToString(), Convert.ToBoolean(dgvHbProductCardTable.Rows[e.RowIndex].Cells["IncreasePrice"].Value));
            }
            else if (e.ColumnIndex == dgvHbProductCardTable.Columns["DecreasePrice"].Index)
            {
                Database.HepsiBuradaMySql.EditDecreasePrice(dgvHbProductCardTable.Rows[e.RowIndex].Cells["HepsiburadaSku"].Value.ToString(), Convert.ToBoolean(dgvHbProductCardTable.Rows[e.RowIndex].Cells["DecreasePrice"].Value));
            }
        }
        private void fzGetListingsToolStripMenuItem_Click(object sender, EventArgs e)
        {
            new Thread(() =>
            {
                try
                {
                    Database.FarmazonMySql.ClearFzListings();
                    MarketPlaces.Farmazon.GetListings();
                    MarketPlaces.Farmazon.GetListings(getActive: false);
                    Action action = () =>
                    {
                        txt_Actions_Done.AppendText("Farmazon ürün içe aktarma işlemi başarıyla tamamlandı." + DateTime.Now.ToString() + Environment.NewLine);
                    };
                    txt_Actions_Done.Invoke(action);

                }
                catch (Exception exc)
                {
                    MessageBox.Show(Form.ActiveForm, "HATA", "Farmazon ürünler içe aktarılırken bir hatayla karşılaşıldı! Hata :" + exc.Message, MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }).Start();
        }
        private void hBGetOrdersPendingApprovalToolStripMenuItem_Click(object sender, EventArgs e)
        {
            new Thread(() =>
            {
                try
                {
                    MarketPlaces.HepsiBurada.GetOrdersPendingApproval();
                    Action action = () =>
                    {
                        txt_Actions_Done.AppendText("HepsiBurada Onay Bekleyen siparişleri güncelleme işlemi başarıyla tamamlandı." + DateTime.Now.ToString() + Environment.NewLine);
                    };
                    txt_Actions_Done.Invoke(action);

                }
                catch (Exception exc)
                {
                    MessageBox.Show(Form.ActiveForm, "HATA", "Onay bekleyen siparişler güncellenirken bir hatayla karşılaşıldı! Hata :" + exc.Message, MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }).Start();
        }
        private void hbGetListingsToolStripMenuItem_Click(object sender, EventArgs e)
        {
            new Thread(() =>
            {
                try
                {
                    Database.HepsiBuradaMySql.ClearListingPricing();
                    Database.HepsiBuradaMySql.ClearBuyboxOrders();
                    MarketPlaces.HepsiBurada.GetListings();
                    //Action action = () =>
                    //{                        
                    //    MessageBox.Show("Hepsiburada ürün içe aktarma işlemi başarıyla tamamlandı." + DateTime.Now.ToString());
                    //};
                    //txt_Actions_Done.Invoke(action);
                    MessageBox.Show("Hepsiburada ürün içe aktarma işlemi başarıyla tamamlandı." + DateTime.Now.ToString());

                }
                catch (Exception exc)
                {
                    MessageBox.Show(Form.ActiveForm, "HATA", "Hepsiburada ürünler içe aktarılırken bir hatayla karşılaşıldı! Hata :" + exc.Message, MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }).Start();
        }
        private void dgv_Stock_Table_DataError(object sender, DataGridViewDataErrorEventArgs e)
        {
            MessageBox.Show("Hata : " + e.Exception.Message);
        }
        private void dgvHbProductCardTable_RowPrePaint(object sender, DataGridViewRowPrePaintEventArgs e)
        {
            try
            {
                var hasBuyboxSeller = dgvHbProductCardTable.Rows[e.RowIndex].Cells["BuyboxMerchantPrice"].Value.ToString() != "< ? >";
                var inBuybox = Convert.ToBoolean(dgvHbProductCardTable.Rows[e.RowIndex].Cells["InBuybox"].Value);
                var buyboxSellingPrice = hasBuyboxSeller ? Convert.ToDouble(dgvHbProductCardTable.Rows[e.RowIndex].Cells["BuyboxMerchantPrice"].Value.ToString().Split('/')[0].Trim(), System.Globalization.CultureInfo.InvariantCulture) : -1;
                var canGetBuybox = hasBuyboxSeller && !inBuybox && Convert.ToDouble(dgvHbProductCardTable.Rows[e.RowIndex].Cells["LowestSellablePrice"].Value) < buyboxSellingPrice;
                if (Convert.ToBoolean(dgvHbProductCardTable.Rows[e.RowIndex].Cells["IsLocked"].Value))
                {
                    dgvHbProductCardTable.Rows[e.RowIndex].DefaultCellStyle.BackColor = System.Drawing.Color.OrangeRed;
                }
                else if (Convert.ToDouble(dgvHbProductCardTable.Rows[e.RowIndex].Cells["Price"].Value) < Convert.ToDouble(dgvHbProductCardTable.Rows[e.RowIndex].Cells["LowestSellablePrice"].Value))
                {
                    dgvHbProductCardTable.Rows[e.RowIndex].Cells["LowestSellablePrice"].Style.BackColor = System.Drawing.Color.Coral;
                }
                else if (canGetBuybox)
                {
                    dgvHbProductCardTable.Rows[e.RowIndex].DefaultCellStyle.BackColor = System.Drawing.Color.MediumSpringGreen;
                }
                if (inBuybox)
                {
                    dgvHbProductCardTable.Rows[e.RowIndex].Cells["BuyboxMerchantRatingName"].Style.BackColor = System.Drawing.Color.Chartreuse;
                }
            }
            catch (Exception exc)
            {
                MessageBox.Show("Hata : " + exc.Message);
            }
        }
        private void dgv_Stock_Table_RowPrePaint(object sender, DataGridViewRowPrePaintEventArgs e)
        {
            var onSale = Convert.ToInt32(dgv_Stock_Table.Rows[e.RowIndex].Cells["TyTotalSellingStock"].Value) + Convert.ToInt32(dgv_Stock_Table.Rows[e.RowIndex].Cells["HbSellingStock"].Value) > 0;
            var stockIsLessThanOnSale = Convert.ToInt32(dgv_Stock_Table.Rows[e.RowIndex].Cells["TyTotalSellingStock"].Value) + Convert.ToInt32(dgv_Stock_Table.Rows[e.RowIndex].Cells["HbSellingStock"].Value) > Convert.ToInt32(dgv_Stock_Table.Rows[e.RowIndex].Cells["UnitStock"].Value);
            var canOpenStock = Convert.ToInt32(dgv_Stock_Table.Rows[e.RowIndex].Cells["HbSellingStock"].Value) == 0 && Convert.ToInt32(dgv_Stock_Table.Rows[e.RowIndex].Cells["UnitStock"].Value) > 0;
            if (stockIsLessThanOnSale && onSale)
            {
                dgv_Stock_Table.Rows[e.RowIndex].Cells["UnitStock"].Style.BackColor = System.Drawing.Color.MediumPurple;
            }
            var unitPriceIsZero = Convert.ToInt32(dgv_Stock_Table.Rows[e.RowIndex].Cells["UnitPrice"].Value) == 0;
            if (unitPriceIsZero && onSale)
            {
                dgv_Stock_Table.Rows[e.RowIndex].Cells["UnitPrice"].Style.BackColor = System.Drawing.Color.Violet;
            }
            if (canOpenStock)
            {
                dgv_Stock_Table.Rows[e.RowIndex].Cells["HbSellingStock"].Style.BackColor = System.Drawing.ColorTranslator.FromHtml("#ab900c");
            }
        }
        private void dgv_TyProduct_Card_Table_RowPrePaint(object sender, DataGridViewRowPrePaintEventArgs e)
        {
            var blacklisted = Convert.ToBoolean(dgv_TyProduct_Card_Table.Rows[e.RowIndex].Cells["Blacklisted"].Value);
            var inBuybox = Convert.ToBoolean(dgv_TyProduct_Card_Table.Rows[e.RowIndex].Cells["In_BuyBox"].Value);
            var stockOut = Convert.ToDouble(dgv_TyProduct_Card_Table.Rows[e.RowIndex].Cells["Selling_Stock"].Value) == 0;
            var hasStock = Convert.ToDouble(dgv_TyProduct_Card_Table.Rows[e.RowIndex].Cells["Unit_Total_Stock"].Value) > 0;
            var buyboxPrice = Convert.ToDouble(dgv_TyProduct_Card_Table.Rows[e.RowIndex].Cells["BuyBox_Seller_Price"].Value);
            var lowestSellablePrice = Convert.ToDouble(dgv_TyProduct_Card_Table.Rows[e.RowIndex].Cells["Lowest_Sellable_Price"].Value);
            var mightGetBuybox = lowestSellablePrice <= buyboxPrice && !inBuybox;
            if (blacklisted)
            {
                dgv_TyProduct_Card_Table.Rows[e.RowIndex].DefaultCellStyle.BackColor = System.Drawing.Color.Tomato;
            }
            else if (stockOut && hasStock)
            {
                dgv_TyProduct_Card_Table.Rows[e.RowIndex].DefaultCellStyle.BackColor = System.Drawing.Color.MediumPurple;
            }
            else if (mightGetBuybox && hasStock)
            {
                dgv_TyProduct_Card_Table.Rows[e.RowIndex].DefaultCellStyle.BackColor = System.Drawing.Color.LimeGreen;
            }
        }
        private void bwHbAutoBb_DoWork(object sender, System.ComponentModel.DoWorkEventArgs e)
        {
            try
            {
                txt_Actions_Done.Invoke(new Action(() => txt_Actions_Done.AppendText("Hepsiburada ürünler içe aktarılmaya başlandı." + DateTime.Now.ToString() + Environment.NewLine)));
                txt_Actions_Done.Invoke(new Action(() => hbStartAutoBbToolStripMenuItem.Text = "HB Oto fiyatlama durdur"));
                MarketPlaces.HepsiBurada.GetListings();
                txt_Actions_Done.Invoke(new Action(() => txt_Actions_Done.AppendText("Hepsiburada ürünler içe aktarıldı. Ürün fiyat değişimine başlanıyor." + DateTime.Now.ToString() + Environment.NewLine)));
                var autoBbListings = Database.HepsiBuradaMySql.GetAutoBbListings();
                for (int i = 0; i < autoBbListings.Rows.Count; i++)
                {
                    AutomateWorks.HBAutoBB.AutoChangePrice(autoBbListings.Rows[i]);
                    if (bwHbAutoBb.CancellationPending)
                    {
                        e.Cancel = true;
                        return;
                    }
                }
                AutomateWorks.HBAutoBB.CommitChangesAndClearList();
            }
            catch (Exception exc)
            {
                SQLFunctions.Write_log("MainWindow", "bwHbAutoBb_DoWork", exc);
            }
        }
        private void bwHbAutoBb_RunWorkerCompleted(object sender, System.ComponentModel.RunWorkerCompletedEventArgs e)
        {
            if (e.Cancelled)
            {
                txt_Actions_Done.AppendText("Hepsiburada otomatik buybox işlemi kullanıcı tarafından sonlandırıldı" + DateTime.Now.ToString() + Environment.NewLine);
                hbStartAutoBbToolStripMenuItem.Text = "HB Oto fiyatlama başlat";
            }
            else
            {
                txt_Actions_Done.AppendText("Hepsiburada otomatik buybox işlemi sona erdi." + DateTime.Now.ToString() + Environment.NewLine);
                bwHbAutoBb.RunWorkerAsync();
            }
        }
        private void hBOtoFiyatlamaBaşlatToolStripMenuItem_Click(object sender, EventArgs e)
        {
            if (bwHbAutoBb.IsBusy)
            {
                bwHbAutoBb.CancelAsync();
            }
            else
            {
                bwHbAutoBb.RunWorkerAsync();
            }
        }

        private void refreshBundleTableToolStripMenuItem_Click(object sender, EventArgs e)
        {
            SQLFunctions.RefreshBundleTable();
        }

        private void programSettingsToolStripMenuItem_Click(object sender, EventArgs e)
        {
            Form settingsForm = new Forms.ProgramSettings();
            settingsForm.ShowDialog();
        }

        private void TrendyolSettingsToolStripMenuItem_Click(object sender, EventArgs e)
        {

        }
    }
}
