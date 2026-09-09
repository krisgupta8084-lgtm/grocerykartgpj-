require("dotenv").config();
const express=require("express"), cors=require("cors"), bcrypt=require("bcryptjs"), jwt=require("jsonwebtoken");
const Database=require("better-sqlite3"), path=require("path");
const app=express(), db=new Database("grocerykart.db");
const PORT=process.env.PORT||3000, SECRET=process.env.JWT_SECRET||"dev-only-change-me";

app.use(cors()); app.use(express.json()); app.use(express.static(path.join(__dirname,"public")));

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT UNIQUE NOT NULL,email TEXT,password_hash TEXT,role TEXT NOT NULL DEFAULT 'customer',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,unit TEXT NOT NULL,price REAL NOT NULL,category TEXT NOT NULL,emoji TEXT DEFAULT '🛍️',stock INTEGER NOT NULL DEFAULT 100,active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,name TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,total REAL NOT NULL,payment_method TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Placed',created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,name TEXT NOT NULL,qty INTEGER NOT NULL,price REAL NOT NULL,FOREIGN KEY(order_id) REFERENCES orders(id));
`);

const count=db.prepare("SELECT COUNT(*) n FROM products").get().n;
if(!count){
 const ins=db.prepare("INSERT INTO products(name,unit,price,category,emoji,stock) VALUES(?,?,?,?,?,?)");
 [["Aashirvaad Atta","5 kg",265,"Staples","🌾",50],["India Gate Basmati Rice","5 kg",520,"Staples","🍚",40],["Toor Dal","1 kg",145,"Staples","🫘",70],["Fortune Sunflower Oil","1 L",135,"Staples","🫗",60],["Amul Taaza Milk","1 L",58,"Dairy","🥛",80],["Amul Butter","500 g",285,"Dairy","🧈",35],["Fresh Bananas","1 kg",55,"Fruits","🍌",100],["Fresh Apples","1 kg",160,"Fruits","🍎",75],["Tomatoes","1 kg",42,"Vegetables","🍅",100],["Potatoes","1 kg",35,"Vegetables","🥔",100],["Parle-G Biscuits","800 g",80,"Snacks","🍪",60],["Coca-Cola","2.25 L",105,"Beverages","🥤",60]].forEach(x=>ins.run(...x));
}

function token(user){return jwt.sign({id:user.id,role:user.role},SECRET,{expiresIn:"7d"})}
function auth(req,res,next){try{const h=req.headers.authorization||"";if(!h.startsWith("Bearer "))throw 0;req.user=jwt.verify(h.slice(7),SECRET);next()}catch(e){res.status(401).json({error:"Authentication required"})}}
function admin(req,res,next){if(req.user.role!=="admin")return res.status(403).json({error:"Admin only"});next()}

app.get("/api/products",(req,res)=>{const q=(req.query.q||"").trim(),cat=req.query.category||"All";let sql="SELECT * FROM products WHERE active=1",args=[];if(q){sql+=" AND (name LIKE ? OR category LIKE ?)";args.push("%"+q+"%","%"+q+"%")}if(cat!=="All"){sql+=" AND category=?";args.push(cat)}sql+=" ORDER BY id DESC";res.json(db.prepare(sql).all(...args))});
app.get("/api/categories",(req,res)=>res.json(db.prepare("SELECT DISTINCT category FROM products WHERE active=1 ORDER BY category").all().map(x=>x.category)));

app.post("/api/auth/register",async(req,res)=>{
 const {name,phone,email,password}=req.body||{}; if(!name||!phone||!password)return res.status(400).json({error:"Name, phone and password are required"});
 try{const hash=await bcrypt.hash(password,12),r=db.prepare("INSERT INTO users(name,phone,email,password_hash) VALUES(?,?,?,?)").run(name,phone,email||null,hash);const u=db.prepare("SELECT id,name,phone,email,role FROM users WHERE id=?").get(r.lastInsertRowid);res.json({token:token(u),user:u})}catch(e){res.status(409).json({error:"Phone already registered"})}
});
app.post("/api/auth/login",async(req,res)=>{
 const {phone,password}=req.body||{},u=db.prepare("SELECT * FROM users WHERE phone=?").get(phone||"");if(!u||!u.password_hash||!(await bcrypt.compare(password||"",u.password_hash)))return res.status(401).json({error:"Invalid login"});const safe={id:u.id,name:u.name,phone:u.phone,email:u.email,role:u.role};res.json({token:token(safe),user:safe});
});

app.post("/api/orders",auth,(req,res)=>{
 const {name,phone,address,payment_method="COD",items}=req.body||{};
 if(!name||!phone||!address||!Array.isArray(items)||!items.length)return res.status(400).json({error:"Complete checkout details required"});
 const get=db.prepare("SELECT * FROM products WHERE id=? AND active=1"), lines=[], tx=db.transaction(()=>{
   let subtotal=0;
   for(const i of items){const p=get.get(i.product_id),qty=Number(i.qty);if(!p||!Number.isInteger(qty)||qty<1||qty>p.stock)throw new Error("Invalid product or stock");subtotal+=p.price*qty;lines.push({p,qty})}
   const delivery=subtotal>=499?0:40,total=subtotal+delivery;
   const o=db.prepare("INSERT INTO orders(user_id,name,phone,address,total,payment_method) VALUES(?,?,?,?,?,?)").run(req.user.id,name,phone,address,total,payment_method);
   const oi=db.prepare("INSERT INTO order_items(order_id,product_id,name,qty,price) VALUES(?,?,?,?,?)");
   const dec=db.prepare("UPDATE products SET stock=stock-? WHERE id=?");
   lines.forEach(x=>{oi.run(o.lastInsertRowid,x.p.id,x.p.name,x.qty,x.p.price);dec.run(x.qty,x.p.id)});
   return {id:o.lastInsertRowid,total};
 });
 try{res.status(201).json(tx())}catch(e){res.status(400).json({error:e.message})}
});
app.get("/api/orders",auth,(req,res)=>res.json(db.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC").all(req.user.id)));

app.get("/api/admin/stats",auth,admin,(req,res)=>res.json({
 products:db.prepare("SELECT COUNT(*) n FROM products WHERE active=1").get().n,
 orders:db.prepare("SELECT COUNT(*) n FROM orders").get().n,
 revenue:db.prepare("SELECT COALESCE(SUM(total),0) n FROM orders WHERE status!='Cancelled'").get().n,
 customers:db.prepare("SELECT COUNT(*) n FROM users WHERE role='customer'").get().n
}));
app.get("/api/admin/orders",auth,admin,(req,res)=>res.json(db.prepare("SELECT * FROM orders ORDER BY id DESC").all()));
app.patch("/api/admin/orders/:id",auth,admin,(req,res)=>{const s=req.body.status;const ok=["Placed","Packed","Out for Delivery","Delivered","Cancelled"].includes(s);if(!ok)return res.status(400).json({error:"Invalid status"});db.prepare("UPDATE orders SET status=? WHERE id=?").run(s,req.params.id);res.json({ok:true})});
app.post("/api/admin/products",auth,admin,(req,res)=>{const {name,unit,price,category,emoji="🛍️",stock=100}=req.body||{};if(!name||!unit||!price||!category)return res.status(400).json({error:"Required fields missing"});const r=db.prepare("INSERT INTO products(name,unit,price,category,emoji,stock) VALUES(?,?,?,?,?,?)").run(name,unit,Number(price),category,emoji,Number(stock));res.status(201).json(db.prepare("SELECT * FROM products WHERE id=?").get(r.lastInsertRowid))});
app.delete("/api/admin/products/:id",auth,admin,(req,res)=>{db.prepare("UPDATE products SET active=0 WHERE id=?").run(req.params.id);res.json({ok:true})});

app.get("/api/health",(req,res)=>res.json({ok:true}));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`GroceryKart running at http://localhost:${PORT}`));
