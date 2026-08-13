using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BuyBoxApp.HelperClasses
{
    public static class InitializeFormHelper
    {
        public static void CheckDbConnection()
        {
            if (string.IsNullOrEmpty(Properties.Settings.Default.MysqlConnectionString))
            {
                CreateConnStr();
            }
            else
            {
                try
                {
                    using (MySql.Data.MySqlClient.MySqlConnection mySqlConnection = new MySql.Data.MySqlClient.MySqlConnection(Properties.Settings.Default.MysqlConnectionString))
                    {
                        mySqlConnection.Open();
                        mySqlConnection.Close();
                    }
                }
                catch (Exception)
                {
                    System.Windows.Forms.MessageBox.Show("Veritabanı bağlantısı oluşturulurken hata ile karşılaşıldı. Lütfen bağlantınızı kontrol edin!","HATA",System.Windows.Forms.MessageBoxButtons.OK,System.Windows.Forms.MessageBoxIcon.Error);
                }
            }
        }
        private static void CreateConnStr()
        {
            bool isEmpty = string.IsNullOrEmpty(Properties.Settings.Default.MysqlConnectionString);
            if (isEmpty)
            {
                var createConnStrForm = new Forms.GetConnectionForm();
                createConnStrForm.ShowDialog();
            }
        }
        // TODO : Fill the class.
    }
}
