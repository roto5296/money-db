const money = require('money-scraping');
const fs = require('fs');
const gapi = require('./googleapi.js');
const sapi = require('./mysqlapi.js')


if(process.argv.length !== 4 && process.argv.length !== 6) {
  console.log('exit');
  process.exit();
}
const year = parseInt(process.argv[2],10);
const month = parseInt(process.argv[3],10);
let T = null;
let N = null;
if(process.argv.length === 6) {
  T = process.argv[4];
  N = process.argv[5];
}
var pass = JSON.parse(process.env.PASS_JSON || fs.readFileSync('password.json'));
(async ()=>{
  try {
    var g_api = new gapi(pass.googleapi.scriptid);
    await g_api.init(pass.googleapi);
    //var api = new sapi();
    //await api.init();
    var api = g_api;
    const TNList = [];
    const types = Object.keys(money);
    for (let type of types) {
      const names = Object.keys(money[type]);
      for (let name of names) {
        if ((!T && !N) || (T === type && N === name)){
          TNList.push([type, name]);
        }
      }
    }
    console.log('~web fetch~');
    const new_data_list = await Promise.all(TNList.map(async ([type, name])=>{
      if (!pass[type][name].options) {
        pass[type][name].options = {};
      }
      pass[type][name].options.cookie_auth = g_api.auth;
      pass[type][name].options.gmail_auth = g_api.auth;
      const client = new money[type][name](pass[type][name]);
      try{
        await client.waitInit();
        await client.login();
        const new_data = await client.getDetails(year, month);
        console.log('['+type+':'+name+']');
        console.log('success');
        if (client.PJS) {
          await client.PJS.exit();
        }
        return new_data;
      } catch (e) {
        console.log('['+type+':'+name+']');
        console.log(e);
        if (client.PJS) {
          await client.PJS.exit();
        }
        return [];
      }
    }));
    console.log('\n~db fetch~');
    const old_data_list = await Promise.all(TNList.map(async ([type, name])=>{
      const old_data = await api.select(type+'-'+name, year, month);
      console.log('['+type+':'+name+']');
      console.log('success');
      return old_data;
    }));
    console.log('\n~merge process~')
    for (let i = 0; i < TNList.length; i++) {
      let insertData = [];
      let updateData_old = [];
      let updateData_new = [];
      const type = TNList[i][0];
      const name = TNList[i][1];
      new_data_list[i].forEach((data)=>{
        let neq_flag = true;
        for (let j = 0; j < old_data_list[i].length; j++) {
          let old_data = old_data_list[i][j];
          //find same data
          if (data.date === old_data.date
              && data.price === old_data.price
              && data.detail === old_data.detail) {
            neq_flag = false;
            old_data_list[i].splice(j, 1);
            break;
          }
        }
        if (neq_flag) {
          let insert_flag = true;
          for (let j = 0; j < old_data_list[i].length; j++) {
            let old_data = old_data_list[i][j];
            //find update data
            if (data.date === old_data.date
                && data.price === old_data.price
                && data.detail !== old_data.detail) {
              insert_flag = false;
              updateData_old.push(old_data);
              updateData_new.push(data);
              old_data_list[i].splice(j, 1);
              break;
            }
          }
          if (insert_flag) {
            insertData.push(data);
          }
        }
      });
      console.log(TNList[i]);
      if (insertData.length) {
        const ret = await api.insert(type+'-'+name, insertData);
        console.log("New " + insertData.length + " Data");
      } else {
        console.log("No New Data");
      }
      if (updateData_old.length) {
        const ret = await api.update(type+'-'+name, updateData_old, updateData_new);
        console.log("Update " + updateData_old.length + " Data");
      } else {
        console.log("No Update Data");
      }
      if (old_data_list[i].length !== 0) {
        console.log("These Data are not found in web data");
        old_data_list[i].forEach((data)=>{
          console.log(data);
        });
      }
    }
    api.close();
  } catch (err) {
    console.log(err);
  }
})();
