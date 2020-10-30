/**
 * @file index.js
 * @description Main entry to cloud function for a daily bot (rovercams) which will grab images from
 * the curiosity mars rover every day and post them to twitter.
 * @author Ryan Hauk <ryan@nighthauk.com>
 */

'use strict';

const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const _ = require('lodash');
const qs = require('querystring');
const Twitter = require('twit');
const Axios = require('axios');

// Static Credentials
const nasaApiKey = 'projects/204450438537/secrets/NASAROV_API_KEY';
const twtrAccessToken = 'projects/204450438537/secrets/TWTR_ACCESS_TOKEN';
const twtrAccessTokenSecret = 'projects/204450438537/secrets/TWTR_ACCESS_TOKEN_SECRET';
const twtrApiKey = 'projects/204450438537/secrets/TWTR_API_KEY';
const twtrApiKeySecret = 'projects/204450438537/secrets/TWTR_API_KEY_SECRET';

// Static endpoints and parameters
const nasaEndpoint = 'https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/photos';

/**
 * 
 * @param {Client} client 
 * @param {String} name 
 */
const getFromSecretManager = async (client, name) => {
    const [version] = await client.accessSecretVersion({
        name: `${name}/versions/latest`,
    });
    return version.payload.data.toString();
};

/**
 * 
 * @param {Client} client our initialized twitter client 
 * @param {String} image the base64 media to be uploaded for the tweet
 */
const getTwtrMediaId = async (client, image) => {
    let mediaPost = await client.post('media/upload', { media_data: image });
    let mediaId = mediaPost.data.media_id_string;

    return mediaId;
}

/**
 * 
 * @param {Date} date new date object to format. Nasa makes these available after UTC has advanced days.
 */
function convertUTCDateToLocalDate(date) {
    var newDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);

    return newDate.toISOString().slice(0, 10);
}

/**
 * Hello, From Mars!
 * 
 * @param {!express:Request} req HTTP request context.
 * @param {!express:Response} res HTTP response context.
 */
exports.helloMars = async (req, res) => {

    let parsedBody;

    // Solves some issue with cloud scheduler execution as a post
    // if (req.header('content-type') === 'application/json') {
    //     console.log('request header content-type is application/json and auto parsing the req body as json');
    //     parsedBody = req.body;
    // } else {
    //     console.log('request header content-type is NOT application/json and MANUALLY parsing the req body as json');
    //     parsedBody = JSON.parse(req.body);
    // }

    // Initialize Secret Manager and Twitter client
    const secretClient = new SecretManagerServiceClient();
    const twtrClient = new Twitter({
        consumer_key: await getFromSecretManager(secretClient, twtrApiKey)
        , consumer_secret: await getFromSecretManager(secretClient, twtrApiKeySecret)
        , access_token: await getFromSecretManager(secretClient, twtrAccessToken)
        , access_token_secret: await getFromSecretManager(secretClient, twtrAccessTokenSecret)
    });

    // Define our query parameters and stringify them
    let queryMap = qs.stringify({
        api_key: await getFromSecretManager(secretClient, nasaApiKey)
        , earth_date: convertUTCDateToLocalDate(new Date())
        , camera: 'NAVCAM' // next revision will cycle random cameras
        , page: 1
    });

    // Get our data from NASA and pick our photos
    let roverPayload = await Axios.get(`${nasaEndpoint}?${queryMap}`);
    let photosArray = roverPayload.data.photos;

    // Todo: Change this to paginated call and filter out some of the crappy photos
    // let reducedCams = _.reject(roverPayload.data.photos, { camera: { name: 'CHEMCAM' }});
    // let roverPhotos = _.sampleSize(reducedCams, 4);

    // Apparently not all cameras take pictures every day..
    if (photosArray === undefined || photosArray.length == 0) {
        res.set('Content-Type', 'application/json')
            .status(200)
            .send(photosArray);
    } else {
        let roverPhotos = photosArray.length > 4 ? _.sampleSize(photosArray, 4) : photosArray;
        let { sol, earth_date } = roverPhotos[0] || {};
        let mediaPayload = [];
        let mediaIds = [];

        for (let record of roverPhotos) {
            // Grab each photo and convert to base64
            let image = await Axios.get(record.img_src, { responseType: 'arraybuffer' });
            let b64Image = Buffer.from(image.data).toString('base64');

            // Push to array for multiple media tweet
            mediaPayload.push(b64Image);
        }

        // Itterate over the b64 image array and exchange them for media Id's for the tweet
        for (let media of mediaPayload) {
            await getTwtrMediaId(twtrClient, media)
                .then(
                    (response) => {
                        mediaIds.push(response);
                    }
                )
                .catch(
                    (error) => {
                        console.log(error);
                    }
                )
        }

        // // Send our final tweet!
        const twtrRes = await twtrClient.post('statuses/update', { status: `Sol: ${sol} | Earth Date: ${earth_date}`, media_ids: mediaIds });

        res.set('Content-Type', 'application/json')
            .status(200)
            .send(twtrRes);
    }
};