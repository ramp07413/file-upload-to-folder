
const {google} = require('googleapis')

const CLIENT_ID = ''

const CLIENT_SECRET = ''

const REDIRECT_URI = ''

const REFRESH_TOKEN = ''


const oauth2client = new google.auth.OAuth2({
    clientId: CLIENT_ID, // Corrected to clientId
    clientSecret: CLIENT_SECRET, // Corrected to clientSecret
    redirectUri: REDIRECT_URI // Corrected to redirectUri
})

oauth2client.setCredentials({refresh_token : REFRESH_TOKEN})

// Attempt to get an access token to ensure the refresh token is working
oauth2client.getAccessToken((err, token) => {
    if (err) {
        console.error('Error getting access token:', err);
    } else {
        console.log('Access Token obtained:', token);
    }
});

module.exports = { oauth2client };
