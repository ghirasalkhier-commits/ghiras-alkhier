const { Client } = require('pg');

class Database {
    constructor(dbPath, callback) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            console.error("ERROR: DATABASE_URL environment variable is missing!");
        }
        this.client = new Client({ 
            connectionString: connectionString,
            ssl: { rejectUnauthorized: false }
        });
        
        this.client.connect((err) => {
            if (callback) callback(err);
            if (err) console.error("PostgreSQL connection error:", err);
            else console.log("Connected to PostgreSQL successfully.");
        });
    }

    convertQuery(sql) {
        let count = 1;
        let converted = sql.replace(/\?/g, () => `$${count++}`);
        // Fix table creation syntax
        converted = converted.replace(/AUTOINCREMENT/g, '');
        converted = converted.replace(/INTEGER PRIMARY KEY/g, 'SERIAL PRIMARY KEY');
        // Return ID on INSERT
        if (converted.trim().toUpperCase().startsWith('INSERT') && !converted.toUpperCase().includes('RETURNING')) {
            converted += ' RETURNING id';
        }
        return converted;
    }

    run(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        this.client.query(this.convertQuery(sql), params || [], (err, res) => {
            if (callback) {
                let context = { changes: res ? res.rowCount : 0, lastID: null };
                if (res && res.rows && res.rows.length > 0 && res.rows[0].id) {
                    context.lastID = res.rows[0].id;
                }
                callback.call(context, err);
            }
        });
        return this;
    }

    get(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        this.client.query(this.convertQuery(sql), params || [], (err, res) => {
            if (callback) callback(err, res && res.rows ? res.rows[0] : null);
        });
        return this;
    }

    all(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        this.client.query(this.convertQuery(sql), params || [], (err, res) => {
            if (callback) callback(err, res ? res.rows : []);
        });
        return this;
    }

    serialize(callback) {
        callback();
        return this;
    }

    prepare(sql) {
        return {
            run: (params, callback) => {
                this.run(sql, params, callback);
            },
            finalize: () => {}
        };
    }
}

module.exports = {
    verbose: () => ({ Database })
};
