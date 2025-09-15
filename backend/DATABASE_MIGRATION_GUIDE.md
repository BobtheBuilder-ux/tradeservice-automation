# Database Migration Guide

## Overview

This guide provides comprehensive instructions for managing the database schema using the new migration system. The system includes a complete database reset script and robust migration tracking capabilities.

## Database System

**Database**: PostgreSQL (via Supabase)  
**Migration System**: Custom with version tracking  
**Compatibility**: PostgreSQL 12+, Supabase

## Files Overview

### Core Migration Files

- `99999999999999_comprehensive_database_reset.sql` - Complete database reset script
- `migration_management.sql` - Utility functions for migration management
- `schema.sql` - Legacy schema file (will be replaced)

### Migration Directory Structure

```
supabase/migrations/
├── 99999999999999_comprehensive_database_reset.sql  # New comprehensive reset
├── migration_management.sql                         # Management utilities
├── [timestamp]_migration_name.sql                   # Future migrations
└── [legacy migration files]                         # Old migration files
```

## Quick Start

### 1. Backup Current Database (CRITICAL)

```bash
# Create a backup before running the reset
supabase db dump --file backup_$(date +%Y%m%d_%H%M%S).sql

# Or using pg_dump directly
pg_dump -h localhost -p 54322 -U postgres -d postgres > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Execute the Comprehensive Reset

**Option A: Using Supabase CLI (Recommended)**
```bash
cd /Users/Bobbieberry/automation/backend
supabase db reset
```

**Option B: Direct SQL Execution**
```bash
# Local development
psql -h localhost -p 54322 -U postgres -d postgres -f supabase/migrations/99999999999999_comprehensive_database_reset.sql

# Production (replace with your connection details)
psql -h your-db-host -p 5432 -U your-user -d your-database -f supabase/migrations/99999999999999_comprehensive_database_reset.sql
```

**Option C: Using Supabase Dashboard**
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `99999999999999_comprehensive_database_reset.sql`
4. Execute the script

### 3. Install Management Utilities

```sql
-- Execute the migration management utilities
\i supabase/migration_management.sql
```

### 4. Verify Installation

```sql
-- Check migration status
SELECT * FROM get_migration_status();

-- Validate database integrity
SELECT * FROM validate_database_integrity();

-- Get database statistics
SELECT * FROM get_database_statistics();
```

## What the Reset Script Does

### 1. Complete Cleanup
- ✅ Drops all existing tables, views, functions, triggers, and sequences
- ✅ Removes all existing data (ensure you have backups!)
- ✅ Cleans up all database objects safely with CASCADE

### 2. Fresh Schema Creation
- ✅ Creates new tables with improved structure and constraints
- ✅ Implements proper foreign key relationships
- ✅ Adds comprehensive indexes for performance
- ✅ Establishes data validation rules

### 3. Migration System Implementation
- ✅ Creates `schema_versions` table for tracking migrations
- ✅ Implements migration locking mechanism
- ✅ Provides rollback capabilities
- ✅ Includes checksum validation

### 4. Enhanced Features
- ✅ Improved audit logging system
- ✅ Workflow automation support
- ✅ Better error handling and validation
- ✅ Comprehensive monitoring views

## New Database Schema

### Core Tables

| Table | Purpose | Key Features |
|-------|---------|-------------|
| `schema_versions` | Migration tracking | Version control, checksums, rollback support |
| `migration_locks` | Concurrency control | Prevents concurrent migrations |
| `agents` | User management | Role-based access, activity tracking |
| `leads` | Lead data | Enhanced validation, better relationships |
| `lead_audit_log` | Change tracking | Comprehensive audit trail |
| `lead_processing_logs` | Processing events | Detailed debugging information |
| `webhook_events` | Webhook management | Event replay, error tracking |
| `system_config` | Configuration | Centralized settings management |
| `workflow_automation` | Automation jobs | Scheduled tasks, retry logic |

### Key Improvements

1. **Data Integrity**
   - Email validation constraints
   - Status value validation
   - Foreign key relationships
   - Generated columns for computed fields

2. **Performance**
   - Optimized indexes for common queries
   - Text search capabilities
   - Composite indexes for complex queries

3. **Monitoring**
   - Comprehensive audit logging
   - Processing event tracking
   - System health monitoring

4. **Automation**
   - Workflow job scheduling
   - Automatic retry mechanisms
   - Error handling and recovery

## Migration System Usage

### Checking Migration Status

```sql
-- Get current migration status
SELECT * FROM get_migration_status();

-- List all applied migrations
SELECT * FROM list_migrations();

-- Check for pending migrations
SELECT * FROM check_pending_migrations();
```

### Creating New Migrations

```sql
-- Generate a migration template
SELECT generate_migration_template('add_new_feature');
```

### Database Maintenance

```sql
-- Perform routine maintenance
SELECT * FROM perform_maintenance(90, true);

-- Clean up old logs (keep 90 days)
SELECT cleanup_old_logs(90);

-- Validate database integrity
SELECT * FROM validate_database_integrity();
```

### Configuration Management

```sql
-- View system configuration
SELECT * FROM system_config ORDER BY key;

-- Backup configuration
SELECT * FROM backup_system_config();

-- Update configuration
UPDATE system_config 
SET value = '"new_value"'::jsonb 
WHERE key = 'setting_name';
```

## Migration Naming Convention

Use the following naming convention for future migrations:

```
YYYYMMDDHHMMSS_descriptive_migration_name.sql
```

**Examples:**
- `20240115143000_add_sms_notifications.sql`
- `20240115150000_update_lead_status_values.sql`
- `20240115160000_create_reporting_views.sql`

## Safety Features

### Migration Locks
- Prevents concurrent migration execution
- Automatic lock acquisition and release
- Lock timeout protection

### Transaction Safety
- All migrations run in transactions
- Automatic rollback on errors
- Consistent state maintenance

### Validation
- Schema integrity checks
- Data constraint validation
- Orphaned record detection

### Backup Integration
- Rollback SQL generation
- Configuration backup utilities
- Migration history tracking

## Troubleshooting

### Common Issues

1. **Migration Lock Error**
   ```sql
   -- Check lock status
   SELECT * FROM migration_locks;
   
   -- Force release lock (use with caution)
   SELECT release_migration_lock();
   ```

2. **Permission Errors**
   ```sql
   -- Check current user permissions
   SELECT current_user, session_user;
   
   -- Verify table permissions
   SELECT * FROM information_schema.table_privileges 
   WHERE grantee = current_user;
   ```

3. **Constraint Violations**
   ```sql
   -- Check for constraint violations
   SELECT * FROM validate_database_integrity();
   
   -- View specific constraint errors
   SELECT conname, contype FROM pg_constraint 
   WHERE NOT convalidated;
   ```

### Recovery Procedures

1. **Restore from Backup**
   ```bash
   # Restore from backup file
   psql -h localhost -p 54322 -U postgres -d postgres < backup_file.sql
   ```

2. **Partial Recovery**
   ```sql
   -- Restore specific table from backup
   -- (requires manual extraction from backup file)
   ```

3. **Reset to Known State**
   ```bash
   # Re-run the comprehensive reset
   psql -h localhost -p 54322 -U postgres -d postgres -f supabase/migrations/99999999999999_comprehensive_database_reset.sql
   ```

## Post-Migration Checklist

### Immediate Verification
- [ ] All tables created successfully
- [ ] Indexes are present and valid
- [ ] Views are accessible
- [ ] Functions execute without errors
- [ ] Triggers are active

### Application Testing
- [ ] Database connections work
- [ ] CRUD operations function correctly
- [ ] Webhook processing works
- [ ] Authentication/authorization intact
- [ ] Data validation rules enforced

### Performance Validation
- [ ] Query performance acceptable
- [ ] Index usage optimized
- [ ] No blocking operations
- [ ] Memory usage normal

### Monitoring Setup
- [ ] Error logging functional
- [ ] Audit trails working
- [ ] Performance metrics available
- [ ] Backup procedures tested

## Best Practices

### Before Migration
1. **Always create backups**
2. **Test in development environment first**
3. **Review migration scripts thoroughly**
4. **Plan for rollback scenarios**
5. **Coordinate with team members**

### During Migration
1. **Monitor for errors**
2. **Keep logs of all operations**
3. **Don't interrupt running migrations**
4. **Verify each step completes**

### After Migration
1. **Validate data integrity**
2. **Test application functionality**
3. **Monitor performance**
4. **Update documentation**
5. **Clean up old migration files**

## Support and Maintenance

### Regular Maintenance Tasks

```sql
-- Weekly: Clean up old logs
SELECT * FROM perform_maintenance(90, true);

-- Monthly: Validate integrity
SELECT * FROM validate_database_integrity();

-- Quarterly: Review migration history
SELECT * FROM list_migrations();
```

### Monitoring Queries

```sql
-- Check system health
SELECT * FROM get_database_statistics();

-- Monitor failed processing
SELECT * FROM failed_processing;

-- Review recent activity
SELECT * FROM recent_lead_activity;
```

### Emergency Contacts

- **Database Issues**: Check application logs and error messages
- **Migration Problems**: Review migration history and lock status
- **Performance Issues**: Run integrity validation and maintenance

## Future Enhancements

The migration system is designed to support:

- [ ] Automated migration deployment
- [ ] Blue-green deployment strategies
- [ ] Advanced rollback capabilities
- [ ] Migration testing frameworks
- [ ] Performance impact analysis
- [ ] Automated backup integration

---

**⚠️ IMPORTANT REMINDERS**

1. **ALWAYS BACKUP** before running migrations
2. **TEST THOROUGHLY** in development first
3. **COORDINATE** with team members
4. **MONITOR** the system after migration
5. **DOCUMENT** any issues or customizations

**🎉 The new migration system provides robust, safe, and trackable database schema management for your lead automation system!**