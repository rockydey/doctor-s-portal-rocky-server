const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' });
        }
        req.decoded = decoded;
        next();
    })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@doctorsportal.tux5p.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const treatmentsCollection = client.db("doctor's_portal").collection("treatments");
        const bookingsCollection = client.db("doctor's_portal").collection("bookings");
        const usersCollection = client.db("doctor's_portal").collection("users");

        app.get('/treatment', async (req, res) => {
            const query = {};
            const cursor = treatmentsCollection.find(query);
            const treatments = await cursor.toArray();
            res.send(treatments);
        });

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
        });

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        });

        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await usersCollection.findOne({ email: requester });
            if (requesterAccount) {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await usersCollection.updateOne(filter, updateDoc);
                res.send(result);
            } else {
                req.status(403).send({ message: 'forbidden access' });
            }
        });

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h'
            });
            res.send({ result, token });
        });

        app.get('/available', async (req, res) => {
            const date = req.query.date;

            // Step 1: Get all treatments
            const treatments = await treatmentsCollection.find().toArray();

            // Step 2: Get the booking of that day
            const query = { date: date };
            const bookings = await bookingsCollection.find(query).toArray();

            // Step 3: For each service, find bookings for that service
            treatments.forEach(treatment => {
                const treatmentBookings = bookings.filter(booking => booking.treatment === treatment.name);
                const booked = treatmentBookings.map(treat => treat.slot)
                // treatment.booked = booked;
                const available = treatment.slots.filter(slot => !booked.includes(slot));
                // treatment.available = available;
                treatment.slots = available;
            })

            res.send(treatments);

        });

        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            // const authorization = req.headers.authorization;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingsCollection.find(query).toArray();
                res.send(bookings);
            } else {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
        });

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient };
            const exits = await bookingsCollection.findOne(query);
            if (exits) {
                return res.send({ success: false, booking: exits });
            }
            const result = await bookingsCollection.insertOne(booking);
            return res.send({ success: true, result });
        });
    }
    finally {

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send("Hello From Doctor's Portal!");
})

app.listen(port, () => {
    console.log(`Doctor's portal app listening on port ${port}`);
})