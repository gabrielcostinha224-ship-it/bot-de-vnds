const express = require('express');
const path = require('path');
const { 
    Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, 
    PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder 
} = require('discord.js');

const app = express();
app.use(express.json());

const client = new Client({ intents: [3276799] });

// Banco de dados em memória
let db = {
    produtos: [],
    chavePix: "Sua Chave Pix Aqui"
};

async function registrarComandos(token, clientId) {
    const commands = [
        new SlashCommandBuilder()
            .setName('painel-vendas')
            .setDescription('Configura o painel principal e a chave PIX')
            .addStringOption(opt => opt.setName('pix').setDescription('Sua chave PIX para recebimento').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
    } catch (e) { console.error(e); }
}

async function iniciarBot(token) {
    client.on('interactionCreate', async (i) => {
        if (!i.guild) return;

        // CRIAÇÃO AUTOMÁTICA DE CARGOS
        let cargoDono = i.guild.roles.cache.find(r => r.name === 'Dono Sirius');
        let cargoVendedor = i.guild.roles.cache.find(r => r.name === 'Vendedor Sirius');
        
        if (!cargoDono) cargoDono = await i.guild.roles.create({ name: 'Dono Sirius', color: '#ff0000', permissions: [PermissionFlagsBits.Administrator] });
        if (!cargoVendedor) cargoVendedor = await i.guild.roles.create({ name: 'Vendedor Sirius', color: '#00ff6a' });

        // 1. COMANDO: /painel-vendas (Define a chave e posta o painel)
        if (i.isChatInputCommand() && i.commandName === 'painel-vendas') {
            db.chavePix = i.options.getString('pix');
            
            const embed = new EmbedBuilder()
                .setTitle("🛒 Central de Vendas Sirius")
                .setDescription("Selecione um produto abaixo para iniciar sua compra.\n\n*Clique no menu para ver as opções disponíveis.*")
                .setColor("#00ff6a")
                .setFooter({ text: "Sistema de Vendas Profissional" });

            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('selecionar_produto')
                    .setPlaceholder('Clique aqui para ver as opções')
                    .addOptions(db.produtos.length > 0 ? db.produtos.map(p => ({
                        label: p.nome,
                        description: `R$ ${p.preco} | Estoque: ${p.estoque}`,
                        value: p.nome
                    })) : [{ label: 'Nenhum produto em estoque', value: 'vazio' }])
            );

            const adminRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('admin_config').setEmoji('⚙️').setStyle(ButtonStyle.Secondary).setLabel('Gerenciar Loja')
            );

            await i.reply({ embeds: [embed], components: [menu, adminRow] });
        }

        // 2. BOTÃO ENGRENAGEM (MODAL DE PRODUTO)
        if (i.isButton() && i.customId === 'admin_config') {
            if (!i.member.roles.cache.has(cargoDono.id)) return i.reply({ content: "❌ Apenas o **Dono Sirius** pode configurar!", ephemeral: true });

            const modal = new ModalBuilder().setCustomId('m_prod').setTitle('Adicionar Novo Produto');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n').setLabel('Nome').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p').setLabel('Preço').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('e').setLabel('Estoque').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('i').setLabel('Link da Imagem').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('d').setLabel('Descrição (Siglas)').setStyle(TextInputStyle.Paragraph))
            );
            return await i.showModal(modal);
        }

        // SALVAR NO DB
        if (i.isModalSubmit() && i.customId === 'm_prod') {
            db.produtos.push({
                nome: i.fields.getTextInputValue('n'),
                preco: i.fields.getTextInputValue('p'),
                estoque: i.fields.getTextInputValue('e'),
                img: i.fields.getTextInputValue('i'),
                desc: i.fields.getTextInputValue('d')
            });
            await i.reply({ content: "✅ Produto salvo! Reenvie o `/painel-vendas` para atualizar o menu.", ephemeral: true });
        }

        // 3. SELEÇÃO NO MENU -> CRIA CARRINHO
        if (i.isStringSelectMenu() && i.customId === 'selecionar_produto') {
            if (i.values[0] === 'vazio') return i.reply({ content: "❌ Adicione produtos primeiro!", ephemeral: true });
            
            const prod = db.produtos.find(p => p.nome === i.values[0]);
            const canal = await i.guild.channels.create({
                name: `🛒-${i.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoVendedor.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoDono.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const embedRevisao = new EmbedBuilder()
                .setTitle("Revisão do Pedido")
                .setDescription(`**Produto:** ${prod.nome}\n**Valor:** R$ ${prod.preco}\n**Estoque:** ${prod.estoque}\n\n${prod.desc}`)
                .setColor("#5865F2").setImage(prod.img);

            const botoes = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pix_${prod.preco}`).setLabel('Ir para o Pagamento').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('cancelar').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
            );

            await canal.send({ content: `${i.user} | Staff: <@&${cargoVendedor.id}>`, embeds: [embedRevisao], components: [botoes] });
            await i.reply({ content: `✅ Carrinho criado: ${canal}`, ephemeral: true });
        }

        // 4. CHECKOUT PIX + TIMER
        if (i.isButton() && i.customId.startsWith('pix_')) {
            const valor = i.customId.split('_')[1];
            const pixEmb = new EmbedBuilder()
                .setTitle("Pagamento PIX")
                .setDescription(`Realize o pagamento de **R$ ${valor}**\n\n**Chave Copia e Cola:**\n\`${db.chavePix}\`\n\n⌛ **Timer:** 10 minutos para confirmação.`)
                .setColor("#00ff6a");

            const rowConfirm = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirmado').setLabel('Confirmar Recebimento').setStyle(ButtonStyle.Primary)
            );

            await i.update({ embeds: [pixEmb], components: [rowConfirm] });

            setTimeout(async () => {
                const c = await i.guild.channels.fetch(i.channelId).catch(() => null);
                if (c) {
                    await c.send("⏰ **Tempo Esgotado!** O carrinho será fechado.");
                    setTimeout(() => c.delete().catch(() => {}), 5000);
                }
            }, 600000);
        }

        // 5. CONFIRMAÇÃO DO VENDEDOR/DONO
        if (i.isButton() && i.customId === 'confirmado') {
            const hasRole = i.member.roles.cache.has(cargoVendedor.id) || i.member.roles.cache.has(cargoDono.id);
            if (!hasRole) return i.reply({ content: "❌ Apenas a equipe de vendas pode confirmar!", ephemeral: true });
            
            await i.reply("💎 **Pagamento Confirmado!** Verifique o chat para a entrega.");
        }

        if (i.isButton() && i.customId === 'cancelar') await i.channel.delete().catch(() => {});
    });

    await client.login(token);
    await registrarComandos(token, client.user.id);
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.post('/ligar-bot', async (req, res) => {
    try { await iniciarBot(req.body.token); res.send({ msg: "OK" }); } 
    catch (e) { res.send({ msg: "ERRO" }); }
});
app.listen(process.env.PORT || 3000, '0.0.0.0');
