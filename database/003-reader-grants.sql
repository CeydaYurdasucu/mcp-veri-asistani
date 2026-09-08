-- Existing installations: restrict the MCP reader to the four allowlisted tables.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM chatbot_reader;
GRANT SELECT ON TABLE public.products, public.customers, public.orders, public.order_items TO chatbot_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM chatbot_reader;
