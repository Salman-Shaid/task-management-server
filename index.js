require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')

const port = process.env.PORT || 5000
const app = express()
// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token

  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.csovo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})
async function run() {
  try {
    const db = client.db('TaskManDB')
    const usersCollection = db.collection('users')
    const tasksCollection = db.collection('tasks')
    // Generate jwt token
    app.post('/jwt', async (req, res) => {
      const email = req.body.email
      const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '365d' });

      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })

    // save or update a user in db
    app.post('/users/:email', async (req, res) => {
      const email = req.params.email
      const query = { email }
      const user = req.body
      // check if user exists in db
      const isExist = await usersCollection.findOne(query)
      if (isExist) {
        return res.send(isExist)
      }
      const result = await usersCollection.insertOne({
        ...user,
        role: 'customer',
        timestamp: Date.now(),
      })
      res.send(result)
    })

    // **Get All Users (Optional)**
    app.get('/users', async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send(users);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch users', error });
      }
    });

    // add task
    app.post('/tasks', async (req, res) => {
      try {
        const { title, description, category, email, displayName } = req.body;
        if (!title || !category) {
          return res.status(400).json({ message: 'Title and category are required' });
        }
        const newTask = {
          title,
          description: description || '',
          category,
          email,
          displayName,
          timestamp: new Date()
        };
        const result = await tasksCollection.insertOne(newTask);
        res.status(201).json(result);
      } catch (error) {
        res.status(500).json({ message: 'Server error', error });
      }
    });

    // 🔹 **Get All Tasks**

    app.get('/tasks', async (req, res) => {
      const result = await tasksCollection.find().toArray()
      res.send(result)
    })

    // 🔹 **Get Only "To-Do" Tasks**
    app.get('/tasks/todo', async (req, res) => {
      try {
        const result = await tasksCollection.find({ category: 'To-Do' }).toArray();
        res.send(result);
      } catch (error) {
        console.error('Error fetching To-Do tasks:', error);
        res.status(500).send({ message: 'Server error' });
      }
    });

    // 🔹 **Get Only "In Progress" Tasks**
    app.get('/tasks/in-progress', async (req, res) => {
      try {
        const result = await tasksCollection.find({ category: 'In Progress' }).toArray();
        res.send(result);
      } catch (error) {
        console.error('Error fetching To-Do tasks:', error);
        res.status(500).send({ message: 'Server error' });
      }
    });

    // 🔹 **Get Only "done" Tasks**
    app.get('/tasks/done', async (req, res) => {
      try {
        const result = await tasksCollection.find({ category: 'In Progress' }).toArray();
        res.send(result);
      } catch (error) {
        console.error('Error fetching To-Do tasks:', error);
        res.status(500).send({ message: 'Server error' });
      }
    });


    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
      } catch (err) {
        res.status(500).send(err)
      }
    })

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from plantNet Server..')
})

app.listen(port, () => {
  console.log(`plantNet is running on port ${port}`)
})
