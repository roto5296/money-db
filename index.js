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
    console.log('\n~merge process~');
    for (let i = 0; i < TNList.length; i++) {
      let insertData = [];
      let deletedData = [];
      let updateData = [];
      const type = TNList[i][0];
      const name = TNList[i][1];
      const new_data = new_data_list[i];
      const old_data = old_data_list[i];
      //find deleted data and update data
      const compareFunc1 = (a, b)=>{
        return a.date === b.date
          && a.price === b.price
          && a.detail === b.detail;
      };
      const compareFunc2 = (a, b)=>{
        return a.date === b.date
          && a.price === b.price;
      };
      let duData = [];
      let new_data_copy = new_data.map((data)=>{return data;});
      old_data.forEach((data)=>{
        let index = new_data_copy.findIndex((element)=>{
          return compareFunc1(element, data)
        });
        if (index === -1) {
          //update or deleted data
          duData.push(data);
        } else {
          //same data
          //set uuid
          new_data_copy[index].uuid = data.uuid;
          new_data_copy.splice(index, 1);
        }
      });
      duData.forEach((data)=>{
        let index = new_data_copy.findIndex((element)=>{
          return compareFunc2(element, data);
        });
        if (index === -1) {
          //deleted data
          deletedData.push(data);
        } else {
          //update data
          //set uuid
          new_data_copy[index].uuid = data.uuid;
          new_data_copy.splice(index, 1);
        }
      });
      let allData = new_data.concat(JSON.parse(JSON.stringify(deletedData)));
      //sort  all data
      let allData_copy = JSON.parse(JSON.stringify(allData));
      allData.sort((a,b)=>{
        let a_d = a.date.split('/');
        let b_d = b.date.split('/');
        for (let j = 0; j < 3; j++) {
          if (a_d[j] < b_d[j]) {
            return -1;
          } else if (a_d[j] > b_d[j]) {
            return 1;
          }
        }
        return allData_copy.findIndex((element)=>{
          return compareFunc1(element, a);
        }) - allData_copy.findIndex((element)=>{
          return compareFunc1(element, b);
        });
      });
      allData.forEach((data, sort)=>{
        //update sort
        data.sort = sort;
        if (data.uuid === undefined) {
          //new data
          insertData.push(data);
        } else {
          let index = old_data.findIndex((element)=>{
            return element.uuid ===  data.uuid;
          });
          if (old_data[index].detail != data.detail
              || old_data[index].sort !== data.sort) {
            //change sort
            updateData.push(data);
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
      if (updateData.length) {
        const ret = await api.update(type+'-'+name, updateData);
        console.log("Update " + updateData.length + " Data");
      } else {
        console.log("No Update Data");
      }
      if (deletedData.length) {
        console.log("These Data are not found in web data");
        deletedData.forEach((data)=>{
          console.log(data);
        });
      }
    }
    api.close();
  } catch (err) {
    console.log(err);
  }
})();
