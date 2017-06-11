const mysql = require('promise-mysql');

class mysqlapi {
  constructor () {}

  async init (config) {
    this.db = await mysql.createConnection(config);
  }

  async close () {
    this.db.end();
  }

  async select (name, year, month) {
    const startDate = year + '-'  + ('0'+month).slice(-2) + '-01';
    const lastDay = new Date(year, month);
    lastDay.setDate(0);
    const endDate = year + '-' + ('0'+month).slice(-2) + '-' + ('0'+lastDay.getDate()).slice(-2);
    let old_data = await this.db.query("SELECT * FROM ?? WHERE date BETWEEN ? AND ? ORDER BY date ASC", [name, startDate, endDate]);
    old_data = old_data.map(function(data){
      data.date = data.date.replace(/-/g, '/');
      return data;
    });
    return old_data;
  }

  async insert (name, data) {
    const ret = await this.db.query('INSERT INTO ?? VALUES ?', [name, data.map(function(d){
      return [d.date, d.price, d.detail];
    })]);
    return true;
  }

  async update (name, old_data, new_data) {
    if (old_data.length !== new_data.length) {
      return false;
    }
    for (let i in old_data) {
      const ret = await this.db.query('UPDATE ?? SET detail = ? WHERE date = ? AND price = ? AND detail = ? LIMIT 1',[name, new_data[i].detail, old_data[i].date, old_data[i].price, old_data[i].detail]);
    }
    return true;
  }
}

module.exports = mysqlapi;
