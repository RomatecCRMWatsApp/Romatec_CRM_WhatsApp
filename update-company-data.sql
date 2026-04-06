-- Atualizar dados da empresa
UPDATE companyConfig SET 
  companyName = 'Romatec Consultoria Total',
  cnpj = '17.261.987/0001-09',
  phone = '(99) 9181-1246',
  address = 'Rua São Raimundo, 10 - Centro, Açailândia - MA',
  email = 'romatec.cad@hotmail.com'
WHERE id = 1;

-- Inserir 4 imóveis
INSERT IGNORE INTO properties (denomination, address, price, description, status, created_at) VALUES
('ALACIDE', 'AV-Tocantins, Quadra 38 Lote 01', 380000.00, 'Lote comercial em localização privilegiada', 'available', NOW()),
('Mod_Vaz-01', 'Rua João Mariquinha, Quadra 15 Lote 12', 300000.00, 'Módulo residencial completo', 'available', NOW()),
('Mod_Vaz-02', 'Rua Amaro Pedroza, Quadra 17 Lote 010', 250000.00, 'Módulo residencial em condomínio', 'available', NOW()),
('Mod_Vaz-03', 'Rua Salomão Awad, Quadra 11 Lote 10E', 210000.00, 'Módulo residencial 60m² com projeto', 'available', NOW());
