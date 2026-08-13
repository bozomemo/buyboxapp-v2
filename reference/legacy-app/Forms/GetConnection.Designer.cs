namespace BuyBoxApp.Forms
{
    partial class GetConnectionForm
    {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.BtnCheckConnection = new System.Windows.Forms.Button();
            this.TxtServerAddr = new System.Windows.Forms.TextBox();
            this.label1 = new System.Windows.Forms.Label();
            this.TxtDefaultDb = new System.Windows.Forms.TextBox();
            this.label2 = new System.Windows.Forms.Label();
            this.TxtUserName = new System.Windows.Forms.TextBox();
            this.label3 = new System.Windows.Forms.Label();
            this.TxtPwd = new System.Windows.Forms.TextBox();
            this.label4 = new System.Windows.Forms.Label();
            this.label5 = new System.Windows.Forms.Label();
            this.label6 = new System.Windows.Forms.Label();
            this.CmbSslMode = new System.Windows.Forms.ComboBox();
            this.NumericUpDownPort = new System.Windows.Forms.NumericUpDown();
            ((System.ComponentModel.ISupportInitialize)(this.NumericUpDownPort)).BeginInit();
            this.SuspendLayout();
            // 
            // BtnCheckConnection
            // 
            this.BtnCheckConnection.Location = new System.Drawing.Point(168, 213);
            this.BtnCheckConnection.Name = "BtnCheckConnection";
            this.BtnCheckConnection.Size = new System.Drawing.Size(147, 23);
            this.BtnCheckConnection.TabIndex = 6;
            this.BtnCheckConnection.Text = "Bağlantıyı Test Et";
            this.BtnCheckConnection.UseVisualStyleBackColor = true;
            this.BtnCheckConnection.Click += new System.EventHandler(this.BtnCheckConnection_Click);
            // 
            // TxtServerAddr
            // 
            this.TxtServerAddr.Location = new System.Drawing.Point(121, 26);
            this.TxtServerAddr.Name = "TxtServerAddr";
            this.TxtServerAddr.Size = new System.Drawing.Size(147, 20);
            this.TxtServerAddr.TabIndex = 0;
            // 
            // label1
            // 
            this.label1.AutoSize = true;
            this.label1.Location = new System.Drawing.Point(39, 29);
            this.label1.Name = "label1";
            this.label1.Size = new System.Drawing.Size(44, 13);
            this.label1.TabIndex = 1;
            this.label1.Text = "Server :";
            // 
            // TxtDefaultDb
            // 
            this.TxtDefaultDb.Location = new System.Drawing.Point(121, 56);
            this.TxtDefaultDb.Name = "TxtDefaultDb";
            this.TxtDefaultDb.Size = new System.Drawing.Size(147, 20);
            this.TxtDefaultDb.TabIndex = 1;
            // 
            // label2
            // 
            this.label2.AutoSize = true;
            this.label2.Location = new System.Drawing.Point(39, 59);
            this.label2.Name = "label2";
            this.label2.Size = new System.Drawing.Size(59, 13);
            this.label2.TabIndex = 3;
            this.label2.Text = "Database :";
            // 
            // TxtUserName
            // 
            this.TxtUserName.Location = new System.Drawing.Point(121, 87);
            this.TxtUserName.Name = "TxtUserName";
            this.TxtUserName.Size = new System.Drawing.Size(147, 20);
            this.TxtUserName.TabIndex = 2;
            // 
            // label3
            // 
            this.label3.AutoSize = true;
            this.label3.Location = new System.Drawing.Point(39, 90);
            this.label3.Name = "label3";
            this.label3.Size = new System.Drawing.Size(52, 13);
            this.label3.TabIndex = 5;
            this.label3.Text = "Kullanıcı :";
            // 
            // TxtPwd
            // 
            this.TxtPwd.Location = new System.Drawing.Point(121, 118);
            this.TxtPwd.Name = "TxtPwd";
            this.TxtPwd.Size = new System.Drawing.Size(147, 20);
            this.TxtPwd.TabIndex = 3;
            this.TxtPwd.UseSystemPasswordChar = true;
            // 
            // label4
            // 
            this.label4.AutoSize = true;
            this.label4.Location = new System.Drawing.Point(39, 121);
            this.label4.Name = "label4";
            this.label4.Size = new System.Drawing.Size(43, 13);
            this.label4.TabIndex = 5;
            this.label4.Text = "Parola :";
            // 
            // label5
            // 
            this.label5.AutoSize = true;
            this.label5.Location = new System.Drawing.Point(39, 152);
            this.label5.Name = "label5";
            this.label5.Size = new System.Drawing.Size(57, 13);
            this.label5.TabIndex = 5;
            this.label5.Text = "Ssl Mode :";
            // 
            // label6
            // 
            this.label6.AutoSize = true;
            this.label6.Location = new System.Drawing.Point(39, 185);
            this.label6.Name = "label6";
            this.label6.Size = new System.Drawing.Size(32, 13);
            this.label6.TabIndex = 5;
            this.label6.Text = "Port :";
            // 
            // CmbSslMode
            // 
            this.CmbSslMode.FormattingEnabled = true;
            this.CmbSslMode.Items.AddRange(new object[] {
            "Required",
            "Preferred",
            "None"});
            this.CmbSslMode.Location = new System.Drawing.Point(121, 149);
            this.CmbSslMode.Name = "CmbSslMode";
            this.CmbSslMode.Size = new System.Drawing.Size(147, 21);
            this.CmbSslMode.TabIndex = 4;
            this.CmbSslMode.Text = "-Ssl Modu Seçiniz-";
            // 
            // NumericUpDownPort
            // 
            this.NumericUpDownPort.Location = new System.Drawing.Point(121, 183);
            this.NumericUpDownPort.Maximum = new decimal(new int[] {
            65535,
            0,
            0,
            0});
            this.NumericUpDownPort.Name = "NumericUpDownPort";
            this.NumericUpDownPort.Size = new System.Drawing.Size(147, 20);
            this.NumericUpDownPort.TabIndex = 5;
            this.NumericUpDownPort.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
            this.NumericUpDownPort.Value = new decimal(new int[] {
            3306,
            0,
            0,
            0});
            // 
            // GetConnectionForm
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 13F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(327, 248);
            this.Controls.Add(this.NumericUpDownPort);
            this.Controls.Add(this.CmbSslMode);
            this.Controls.Add(this.BtnCheckConnection);
            this.Controls.Add(this.label6);
            this.Controls.Add(this.label5);
            this.Controls.Add(this.label4);
            this.Controls.Add(this.TxtServerAddr);
            this.Controls.Add(this.TxtPwd);
            this.Controls.Add(this.label1);
            this.Controls.Add(this.label3);
            this.Controls.Add(this.TxtDefaultDb);
            this.Controls.Add(this.TxtUserName);
            this.Controls.Add(this.label2);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
            this.Name = "GetConnectionForm";
            this.Text = "Veritabanına Bağlan";
            ((System.ComponentModel.ISupportInitialize)(this.NumericUpDownPort)).EndInit();
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion

        private System.Windows.Forms.Button BtnCheckConnection;
        private System.Windows.Forms.TextBox TxtServerAddr;
        private System.Windows.Forms.Label label1;
        private System.Windows.Forms.TextBox TxtDefaultDb;
        private System.Windows.Forms.Label label2;
        private System.Windows.Forms.TextBox TxtUserName;
        private System.Windows.Forms.Label label3;
        private System.Windows.Forms.TextBox TxtPwd;
        private System.Windows.Forms.Label label4;
        private System.Windows.Forms.Label label5;
        private System.Windows.Forms.Label label6;
        private System.Windows.Forms.ComboBox CmbSslMode;
        private System.Windows.Forms.NumericUpDown NumericUpDownPort;
    }
}