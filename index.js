const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const PORT = process.env.PORT || 3009;

const app = express();
const pool = new Pool({
    user: 'postgres_user',
    host: 'dpg-d00gtlhr0fns73e9bi0g-a',
    database: 'porstgres_y0yk',
    password: 'JNqvcVacasGCyDi8iDo0xamILGRO1lUY',
    port: 5432,
});

app.use(cors());
app.use(express.json());


app.get('/api/catalog', async (req, res) => {
    try {
        const searchQuery = req.query.q;
        let query = 'SELECT * FROM catalog';
        let params = [];

        if (searchQuery) {
            query = 'SELECT * FROM catalog WHERE product_name ILIKE $1';
            params = [`%${searchQuery}%`];
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get('/api/catalog/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM catalog WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Товар не найден" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post('/api/register', async (req, res) => {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ error: "Все поля обязательны для заполнения" });
    }

    try {

        const userExists = await pool.query('SELECT * FROM "User" WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: "Пользователь с таким email уже существует" });
        }


        const result = await pool.query(
            'INSERT INTO "User" (first_name, last_name, email, password) VALUES ($1, $2, $3, $4) RETURNING *',
            [firstName, lastName, email, password]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });

    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;


    if (!email || !password) {
        return res.status(400).json({ error: "Все поля обязательны для заполнения" });
    }

    try {

        const user = await pool.query('SELECT * FROM "User" WHERE email = $1 AND password = $2', [email, password]);
        if (user.rows.length === 0) {
            return res.status(400).json({ error: "Неверный email или пароль" });
        }

        res.status(200).json({ message: "Вход выполнен успешно", user: user.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


app.post('/api/change-password', async (req, res) => {
    const { email, oldPassword, newPassword } = req.body;

    if (!email || !oldPassword || !newPassword) {
        return res.status(400).json({ error: "Все поля обязательны" });
    }

    try {
        const user = await pool.query('SELECT * FROM "User" WHERE email = $1 AND password = $2', [email, oldPassword]);

        if (user.rows.length === 0) {
            return res.status(400).json({ error: "Старый пароль неверен" });
        }

        await pool.query('UPDATE "User" SET password = $1 WHERE email = $2', [newPassword, email]);

        res.status(200).json({ message: "Пароль успешно обновлен" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

app.post('/api/cart/add', async (req, res) => {
    try {
        const { user_id, product_id, quantity } = req.body;


        const existingItem = await pool.query(
            'SELECT * FROM cart WHERE user_id = $1 AND product_id = $2',
            [user_id, product_id]
        );

        if (existingItem.rows.length > 0) {

            await pool.query(
                'UPDATE cart SET quantity = quantity + $1 WHERE user_id = $2 AND product_id = $3',
                [quantity, user_id, product_id]
            );
        } else {

            await pool.query(
                'INSERT INTO cart (user_id, product_id, quantity, price_at_adding) ' +
                'VALUES ($1, $2, $3, (SELECT price FROM catalog WHERE id = $2))',
                [user_id, product_id, quantity]
            );
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get('/api/cart/:user_id', async (req, res) => {
    try {
        const { user_id } = req.params;

        const result = await pool.query(
            `SELECT c.id, c.product_id, p.product_name, p.image_path, 
             c.quantity, c.price_at_adding, c.item_total
             FROM cart c
             JOIN catalog p ON c.product_id = p.id
             WHERE c.user_id = $1`,
            [user_id]
        );


        const totals = await pool.query(
            'SELECT SUM(quantity) as total_items, SUM(item_total) as cart_total FROM cart WHERE user_id = $1',
            [user_id]
        );

        res.json({
            items: result.rows,
            totals: totals.rows[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.put('/api/cart/update', async (req, res) => {
    try {
        const { cart_id, quantity } = req.body;
        const quantityNum = parseInt(quantity, 10);

        if (isNaN(quantityNum)) {
            return res.status(400).json({ error: "Некорректное количество" });
        }

        const result = await pool.query(
            `UPDATE cart 
             SET quantity = $1 
             WHERE id = $2
             RETURNING *`,
            [quantityNum, cart_id]
        );

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Ошибка обновления:', error.stack);
        res.status(500).json({
            error: "Ошибка сервера",
            details: error.message
        });
    }
});

app.delete('/api/cart/remove/:cart_id', async (req, res) => {
    try {
        const { cart_id } = req.params;

        await pool.query('DELETE FROM cart WHERE id = $1', [cart_id]);

        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


const adminAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const [login, password] = credentials;

    if (login === 'admin' && password === 'admin') {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized" });
    }
};

app.post('/admin/products', adminAuth, async (req, res) => {
    try {
        console.log('Received data:', req.body);
        const { product_name, price, description, image_path } = req.body;

        if (!product_name || !price || isNaN(price)) {
            return res.status(400).json({ error: "Некорректные данные товара" });
        }

        const result = await pool.query(
            'INSERT INTO catalog (product_name, price, description, image_path) VALUES ($1, $2, $3, $4) RETURNING *',
            [product_name, parseFloat(price), description || null, image_path || null]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error in POST /admin/products:', error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
});


app.delete('/admin/products/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM catalog WHERE id = $1', [id]);
        res.status(204).end();
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({
            error: "Internal Server Error",
            details: error.message
        });
    }
});

app.put('/api/update-address', async (req, res) => {
    const { email, deliveryAddress } = req.body;

    try {
        const result = await pool.query(
            'UPDATE "User" SET delivery_address = $1 WHERE email = $2 RETURNING delivery_address',
            [deliveryAddress, email]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json({ deliveryAddress: result.rows[0].delivery_address });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});


app.post('/api/add-favorite', async (req, res) => {
    const { userId, product } = req.body;

    if (!userId || !product) {
        return res.status(400).json({ error: 'Некорректные данные' });
    }

    try {
        const result = await pool.query('SELECT favorite_products FROM "User" WHERE id = $1', [userId]);
        const favorites = result.rows[0].favorite_products || [];

        const alreadyExists = favorites.some(p => p.id === product.id);
        if (alreadyExists) {
            return res.status(200).json({ message: 'Товар уже в избранном' });
        }

        favorites.push(product);

        await pool.query(
            'UPDATE "User" SET favorite_products = $1 WHERE id = $2',
            [JSON.stringify(favorites), userId]
        );

        res.status(200).json({ message: 'Добавлено в избранное' });
    } catch (error) {
        console.error('Ошибка добавления в избранное:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/favorites/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
        const result = await pool.query(
            'SELECT favorite_products FROM "User" WHERE id = $1',
            [userId]
        );

        const favorites = result.rows[0]?.favorite_products || [];
        res.json(favorites);
    } catch (error) {
        console.error('Ошибка получения избранного:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.put('/api/favorites/remove', async (req, res) => {
    const { userId, productName } = req.body;

    try {
        const result = await pool.query(
            `UPDATE "User"
     SET favorite_products = COALESCE((
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(favorite_products) elem
    WHERE elem->>'name' != $2
      ), '[]'::jsonb)
     WHERE id = $1
     RETURNING favorite_products`,
            [userId, productName]
        );

        res.json({ success: true, updatedFavorites: result.rows[0].favorite_products });
    } catch (error) {
        console.error('Ошибка удаления из избранного:', error);
        res.status(500).json({ error: 'Ошибка при удалении из избранного' });
    }
});


app.listen(PORT, () => {
    console.log(`Server starting on port ${PORT}`);
});
