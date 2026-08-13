using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace BuyBoxApp.Forms
{
    public partial class GetConnectionForm : Form
    {
        public GetConnectionForm()
        {
            InitializeComponent();
        }
        private void BtnCheckConnection_Click(object sender, EventArgs e)
        {
            if (string.IsNullOrEmpty(CmbSslMode.Text) || string.IsNullOrEmpty(TxtServerAddr.Text) || string.IsNullOrEmpty(TxtDefaultDb.Text) || string.IsNullOrEmpty(TxtUserName.Text) || string.IsNullOrEmpty(TxtPwd.Text))
            {
                MessageBox.Show("Alanlardan birisini boş bıraktınız. Lütfen bütün alanları doldurunuz!");
            }
            else
            {
                try
                {
                    string connStr = CreateConnectionString();
                    using (MySql.Data.MySqlClient.MySqlConnection mySqlConnection = new MySql.Data.MySqlClient.MySqlConnection(connStr))
                    {
                        mySqlConnection.Open();
                        MessageBox.Show("Veritabanı bağlantısı başarıyla gerçekleştirildi. Varsayılan bağlantı olarak kaydedildi.");
                        Properties.Settings.Default.MysqlConnectionString = connStr;
                        Properties.Settings.Default.Save();
                        mySqlConnection.Close();
                        Close();
                    }
                }
                catch (Exception exc)
                {
                    MessageBox.Show("Veritabanına bağlanılamadı. Lütfen tekrar deneyiniz. " + Environment.NewLine + "Hata : " + exc.Message);
                }
            }
        }
        private string CreateConnectionString()
        {
            MySql.Data.MySqlClient.MySqlConnectionStringBuilder MySqlConnectionStringBuilder = new MySql.Data.MySqlClient.MySqlConnectionStringBuilder
            {
                Server = TxtServerAddr.Text,
                Database = TxtDefaultDb.Text,
                UserID = TxtUserName.Text,
                Password = TxtPwd.Text,
                Port = Convert.ToUInt32(NumericUpDownPort.Value)
            };
            switch (CmbSslMode.Text)
            {
                case "Preferred":
                    MySqlConnectionStringBuilder.SslMode = MySql.Data.MySqlClient.MySqlSslMode.Prefered;
                    break;
                case "Required":
                    MySqlConnectionStringBuilder.SslMode = MySql.Data.MySqlClient.MySqlSslMode.Required;
                    break;
                case "None":
                    MySqlConnectionStringBuilder.SslMode = MySql.Data.MySqlClient.MySqlSslMode.None;
                    break;
                default:
                    break;
            }
            return MySqlConnectionStringBuilder.ConnectionString;
        }
    }
}
