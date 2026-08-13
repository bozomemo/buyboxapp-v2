using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace BuyBoxApp
{
    internal struct Applications
    {
        static public DataTable StockTable { get; set; }
        static public DataTable TyTable { get; set; }
        static public DataTable Stock_Table { get; set; }
        static public DataTable TyProduct_Card_Table { get; set; }
        static public DataTable HbProductCardTable { get; set; }
    }
}
