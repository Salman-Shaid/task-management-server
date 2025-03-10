require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');
const port = process.env.PORT || 5000;
const app = express();
const server = http.createServer(app); 

// WebSocket Server Configuration
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:5174', 'https://task-management-234b9.web.app', 'https://task-management-234b9.firebaseapp.com', 'https://task-management-server-j8t7.onrender.com'],
    credentials: true,
  },
});

// Middleware
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174', 'https://task-management-234b9.web.app', 'https://task-management-234b9.firebaseapp.com'], credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

// **MongoDB Connection**
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.csovo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function connectDB() {
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db('TaskManDB');
    const usersCollection = db.collection('users');
    const tasksCollection = db.collection('tasks');

    // Create Indexes for Optimized Queries
    await tasksCollection.createIndex({ email: 1 });
    await usersCollection.createIndex({ email: 1 }, { unique: true });

    app.post('/users/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;

      try {
        let existingUser = await usersCollection.findOne({ email });

        if (!existingUser) {
          const newUser = {
            ...user,
            role: 'customer',
            timestamp: new Date().toISOString()
          };
          await usersCollection.insertOne(newUser);
          existingUser = newUser; 
        }

        res.json(existingUser);
      } catch (error) {
        res.status(500).json({ message: 'Failed to save user', error });
      }
    });

    // **Get All Users**
    app.get('/users', async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.json(users);
      } catch (error) {
        res.status(500).json({ message: 'Failed to fetch users', error });
      }
    });

    // **Get All Tasks**
    app.get('/tasks', async (req, res) => {
      try {
        const tasks = await tasksCollection.find().toArray();
        res.json(tasks);
      } catch (error) {
        res.status(500).json({ message: 'Failed to fetch tasks', error });
      }
    });

    // **Add Task**
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
          timestamp: new Date(),
        };

        const result = await tasksCollection.insertOne(newTask);

        if (result.acknowledged) {
          newTask._id = result.insertedId; 

      
          const updatedTasks = await tasksCollection.find().toArray();
          io.emit('tasks:update', updatedTasks);

          res.status(201).json(newTask);
        } else {
          res.status(500).json({ message: 'Failed to add task' });
        }
      } catch (error) {
        res.status(500).json({ message: 'Server error', error });
      }
    });


    // **WebSocket Connection**
    io.on('connection', (socket) => {
      console.log('🔗 User connected:', socket.id);

      const sendTasks = async () => {
        try {
          const tasks = await tasksCollection.find().toArray();
          io.emit('tasks:update', tasks);
        } catch (error) {
          console.error("❌ Error fetching tasks:", error);
        }
      };

      // Send Initial Tasks when a user connects
      sendTasks();

      // Handle fetching tasks when requested by client
      socket.on("getTasks", async () => {
        const tasks = await tasksCollection.find().toArray();
        socket.emit("tasks:update", tasks);  
      });

      // Handle task update
      socket.on('task:update', async (updatedTask, callback) => {
        try {
          const { _id, ...updateData } = updatedTask;
          await tasksCollection.updateOne({ _id: new ObjectId(_id) }, { $set: updateData });

          await sendTasks(); // 
          callback && callback({ success: true });
        } catch (error) {
          console.error('Error updating task:', error);
          callback && callback({ success: false, error: 'Failed to update task' });
        }
      });

      // Handle task delete
      socket.on('task:delete', async (taskId, callback) => {
        try {
          await tasksCollection.deleteOne({ _id: new ObjectId(taskId) });

          await sendTasks(); 
          callback && callback({ success: true });
        } catch (error) {
          console.error('Error deleting task:', error);
          callback && callback({ success: false, error: 'Failed to delete task' });
        }
      });

      socket.on('disconnect', () => {
        console.log('🔗 User disconnected:', socket.id);
      });
    });


    // Start the Server with WebSockets
    server.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${port}`);
    });

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

connectDB();

app.get('/', (req, res) => {
  res.send(' Hello from Task Manager Server.');
});
