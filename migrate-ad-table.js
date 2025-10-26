// migrate-ad-table.js
// Run this file once to create the ad_submissions table
// Usage: node migrate-ad-table.js

require("dotenv").config();
const pool = require("./db");

async function createAdSubmissionsTable() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Creating ad_submissions table...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS ad_submissions (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        ad_text TEXT NOT NULL,
        link_url TEXT NOT NULL,
        buyer_email VARCHAR(255) NOT NULL,
        image_url TEXT NOT NULL,
        duration_days INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'pending_review',
        payment_intent_id VARCHAR(255),
        submitted_at TIMESTAMP DEFAULT NOW(),
        reviewed_at TIMESTAMP,
        reviewed_by VARCHAR(255),
        notes TEXT,
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    console.log('✅ Table created successfully!');
    
    console.log('🔄 Creating indexes...');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ad_submissions_status 
      ON ad_submissions(status);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ad_submissions_dates 
      ON ad_submissions(start_date, end_date);
    `);
    
    console.log('✅ Indexes created successfully!');
    
    // Verify the table exists
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ad_submissions'
      ORDER BY ordinal_position;
    `);
    
    console.log('\n📋 Table structure:');
    console.table(result.rows);
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Error creating table:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createAdSubmissionsTable()
  .then(() => {
    console.log('🎉 Done! You can now use the admin panel.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to create table:', error);
    process.exit(1);
  });