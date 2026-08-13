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
    public partial class ProgramSettings : Form
    {

        readonly MySql.Data.MySqlClient.MySqlConnectionStringBuilder mySqlConnectionStringBuilder = new MySql.Data.MySqlClient.MySqlConnectionStringBuilder(Properties.Settings.Default.MysqlConnectionString);
        public ProgramSettings()
        {
            InitializeComponent();
        }

        private void ProgramSettings_Load(object sender, EventArgs e)
        {
            TxtSvAddress.Text = mySqlConnectionStringBuilder.Server;
            TxtDbName.Text = mySqlConnectionStringBuilder.Database;
            TxtUserName.Text = mySqlConnectionStringBuilder.UserID;
            TxtPassword.Text = mySqlConnectionStringBuilder.Password;
            NumericUpDownPort.Value = mySqlConnectionStringBuilder.Port;
            switch (mySqlConnectionStringBuilder.SslMode)
            {
                case MySql.Data.MySqlClient.MySqlSslMode.None:
                    CmbSslMode.SelectedIndex = 2;
                    break;
                case MySql.Data.MySqlClient.MySqlSslMode.Preferred:
                    CmbSslMode.SelectedIndex = 1;
                    break;
                case MySql.Data.MySqlClient.MySqlSslMode.Required:
                    CmbSslMode.SelectedIndex = 0;
                    break;
                default:
                    break;
            }
        }

        private void btnSave_Click(object sender, EventArgs e)
        {
            mySqlConnectionStringBuilder.Server = TxtSvAddress.Text;
            mySqlConnectionStringBuilder.Database = TxtDbName.Text;
            mySqlConnectionStringBuilder.UserID = TxtUserName.Text;
            mySqlConnectionStringBuilder.Password = TxtPassword.Text;
            mySqlConnectionStringBuilder.Port = Convert.ToUInt32(NumericUpDownPort.Value);
            switch (CmbSslMode.SelectedIndex)
            {
                case 2:
                    mySqlConnectionStringBuilder.SslMode = MySql.Data.MySqlClient.MySqlSslMode.None;
                    break;
                case 1:
                    mySqlConnectionStringBuilder.SslMode = MySql.Data.MySqlClient.MySqlSslMode.Preferred;
                    break;
                case 0:
                    mySqlConnectionStringBuilder.SslMode = MySql.Data.MySqlClient.MySqlSslMode.Required;
                    break;
                default:
                    break;
            }
            Properties.Settings.Default.MysqlConnectionString = mySqlConnectionStringBuilder.ConnectionString;
            Properties.Settings.Default.Save();
        }
    }
}
