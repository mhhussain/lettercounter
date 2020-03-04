
let axios = require('axios');
let _ = require('lodash');
let moment = require('moment');
let uuid = require('uuid/v4');
let { Pool } = require('pg');

let bucketsURL = _.defaultTo(process.env.BUCKETS_URL, '');
let workflowURL = _.defaultTo(process.env.WORKFLOW_URL, '');

let hostname = process.env.HOSTNAME;

let pool = new Pool({
    host: _.defaultTo(process.env.DB_HOST ,''),
    port: _.defaultTo(process.env.DB_PORT ,5432),
    user: _.defaultTo(process.env.DB_USER ,''),
    password: _.defaultTo(process.env.DB_PASSWORD ,''),
    database: _.defaultTo(process.env.DB_NAME ,'')
});

let outerTicker = _.defaultTo(process.env.OUTER_TICKER, 3000);
let innerTicker = _.defaultTo(process.env.INNER_TICKER, 1000);

let parserDefinitionId = _.defaultTo(process.env.PARSER_DEFINITION_ID, 2);

setInterval(() => {
    pool.query(`
    SELECT "itemkey"
    FROM workflow.item
    WHERE "definitionid" = $1
    GROUP BY "itemkey"
    HAVING COUNT(*) = 1
    LIMIT 1
    `, [parserDefinitionId])
        .then((dbres) => {
            let row = dbres.rows[0];
            if (!row) {
                console.log('poll: no new items');
                return;
            }

            console.log(`item: [${row.itemkey}]               status: [ found ]`);
            let item = {
                id: 0,
                definitionId: parserDefinitionId,
                executionId: 0,
                host: hostname,
                service: "lettercounter",
                itemkey: row.itemkey,
                sequence: 0,
                status: "processing",
                summary: "item processing started",
                timestamp: moment().format('YYYY-MM-DDTHH:mm:ss.sss'),
                itemAttributes: {}
            };
            console.log(`                                                           status: [ requesting lock ]`);
            axios.post(`${workflowURL}/api/v2/item/requestLock`, item)
                .then((d) => {
                    console.log(`                                                           status: [ lock acquired ]`);
                    console.log(`                                                           status: [ processing ]`);

                    pool.query(`
                    SELECT * FROM workflow.item i
                    WHERE i."itemkey" = $1 and i."status" = 'created'
                    `, [row.itemkey])
                    .then((dbres1) => {
                        let sr = JSON.parse(dbres1.rows[0].itemattributes);

                        console.log(`                                                           status: [ retrieving item: ${bucketsURL}/${sr.selfReference} ]`);

                        setTimeout(() => {
                            axios.get(`${bucketsURL}/${sr.selfReference}`)
                                .then((d) => {
                                    console.log(`                                                           status: [ retrieved ]`);
                                    //console.log(d);
                                    
                                    // set timeout and complete
                                        let newitem = {
                                            id: 0,
                                            definitionId: parserDefinitionId,
                                            executionId: 0,
                                            host: hostname,
                                            service: "lettercounter",
                                            itemkey: row.itemkey,
                                            sequence: 0,
                                            status: "complete",
                                            summary: "item processing complete",
                                            timestamp: moment().format('YYYY-MM-DDTHH:mm:ss.sss'),
                                            itemAttributes: JSON.stringify({ metrics: { count: d.data.length } })
                                        };
                
                                        axios.post(`${workflowURL}/api/v2/item/updateLock`, newitem)
                                            .then((d) => {
                                                console.log(`                                                           status: [ completed ]`);
                                                //console.log(d.data);
                                            })
                                            .catch((e) => {
                                                console.log(e);
                                            });
                            });
                        }, innerTicker);
                    }).catch((e) => {
                        //db error
                        console.log(e);
                    });
                })
                .catch((e) => {
                    // lock request failed
                    //console.log(e);
                    console.log(`item: [${row.itemkey}]               status: [ lock request failed, moving on ]`);
                });
        })
        .catch((e) => {
            console.error(e);
        });
}, outerTicker);
