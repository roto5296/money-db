const fs = require('fs');
const rl = require('readline-sync');
const {google} = require('googleapis');
const googleAuth = require('google-auth-library');
const util = require('util');
const request = require('request-promise');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive', 'https://mail.google.com/']

class googleapi {
  constructor (scriptId) {
    this.scriptId = scriptId;
  }

  async init (credentials) {
    var clientSecret = credentials.web.client_secret;
    var clientId = credentials.web.client_id;
    var redirectUrl = credentials.web.redirect_uris[0];
    var oauth2Client = new googleAuth.OAuth2Client(clientId, clientSecret, redirectUrl);
    
    // Get access token from refresh token
    oauth2Client.credentials.refresh_token = credentials.refresh_token;
    await oauth2Client.refreshAccessToken();
    this.auth = oauth2Client;
    return true;
  }
  
  async close () {}

  async getNewToken (oauth2Client) {
    var authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES
    });
    console.log('Authorize this app by visiting this url: ', authUrl);
    var code = rl.question('Enter the code from that page here: ')
    try {
      var r = await oauth2Client.getToken(code);
      return r.tokens;
    } catch (err) {
      console.log('Error while trying to retrieve access token', err);
      return false;
    }
  }
    
  async script (resource) {
    var script = google.script('v1');
    
    // Make the API request. The request object is included here as 'resource'.
    try {
      var run = util.promisify(script.scripts.run)
      var resp =  await run({
        auth: this.auth,
        resource: resource,
        scriptId: this.scriptId
      });
      if (resp.data.error) {
        // The API executed, but the script returned an error.
        
        // Extract the first (and only) set of error details. The values of this
        // object are the script's 'errorMessage' and 'errorType', and an array
        // of stack trace elements.
        var error = resp.data.error.details[0];
        console.log('Script error message: ' + error.errorMessage);
        console.log('Script error stacktrace:');
        
        if (error.scriptStackTraceElements) {
          // There may not be a stacktrace if the script didn't start executing.
          for (var i = 0; i < error.scriptStackTraceElements.length; i++) {
            var trace = error.scriptStackTraceElements[i];
            console.log('\t%s: %s', trace.function, trace.lineNumber);
          }
        }
      } else{
        return resp.data.response.result;
      }
    } catch (err) {
      // The API encountered a problem before the script started executing.
      console.log('The API returned an error: ' + err);
      return false;
    }
  }
  
  async select (name, year, month) {
    var resource =  {
      function: 'getData',
      parameters: [name, year, month]
    };
    var ret = await this.script(resource);
    return ret;
  }

  async insert (name, data) {
    var resource =  {
      function: 'appendRows',
      parameters: [name, data]
    };
    var ret = await this.script(resource);
    return ret;
  }

  async update (name, old_data, new_data) {
    var resource = {
      function: 'updateRows',
      parameters: [
        name,
        old_data.map(function(data){
          return data.uuid;
        }),
        new_data
      ]
    };
    var ret = await this.script(resource);
    return ret;
  }

  async drive_get (file_id) {
    var drive = google.drive({version:'v2', auth: this.auth});
    var run = util.promisify(drive.files.get);
    var ret = await run({
      fileId: file_id
    });
    var content = await request.get(ret.data.downloadUrl,{
      headers: {
        'Authorization': 'Bearer '+this.auth.credentials.access_token
      }
    });
    return JSON.parse(content);
  }

  async drive_update (file_id, body) {
    var drive = google.drive({version:'v2', auth: this.auth});
    var run = util.promisify(drive.files.update);
    var ret = await run({
      fileId: file_id,
      uploadType: "media",
      media: {
        mimeType: 'application/json',
        body: JSON.stringify(body)
      }
    });
  }
}

module.exports = googleapi;
