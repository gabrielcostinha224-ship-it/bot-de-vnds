const express = require('express');
const path = require('path');
const { 
    Client, GatewayIntentBits, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, 
    SlashCommandBuilder, REST, Routes, PermissionFlagsBits, ChannelType, ButtonBuilder, 
    ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

let db = {
    config: {
        nome: "Sua Loja",
        pix: "Não configurado",
        banner: "https://i.imgur.com/vWb6XyS.png",
        msgVendas: "📌 Escolha sua conta abaixo.",
        siglas: "Configurar siglas no /gerenciar",
        msgTicket: "Olá! Realize o pagamento para receber seu produto."
    },
    estoque: [] 
};

const client = new Client({ intents: [3276799] });

async function iniciarBot(token) {
    if (client.readyAt) return; // Evita ligar duas vezes
    
    client.on('ready', async () => {
        try {
            const commands = [
                new SlashCommandBuilder().setName('vendas').setDescription('Postar painel de vendas'),
                new SlashCommandBuilder().setName('gerenciar').setDescription('Painel de controle')
            ].map(c => c.toJSON());
            const rest = new REST({ version: '10' }).setToken(token);
            await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
            console.log(`✅ Bot ${client.user.tag} Online!`);
        } catch (e) { console.error(e); }
    });

    client.on('interactionCreate', async (i) => {
        if (i.commandName === 'vendas') {
            const embed = new EmbedBuilder().setTitle(`⭐ ${db.config.nome}`).setImage(db.config.banner).setColor("#2b2d31").setDescription(`${db.config.msgVendas}\n\n**Siglas:**\n${db.config.siglas}`);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ver_opc').setLabel('🛒 Ver Opções').setStyle(ButtonStyle.Success));
            return i.reply({ embeds: [embed], components: [row] });
        }

        if (i.commandName === 'gerenciar') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('g_msgs').setLabel('Mensagens').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('g_add').setLabel('Add Produto').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('g_loja').setLabel('Config Loja').setStyle(ButtonStyle.Secondary)
            );
            return i.reply({ content: "🛠️ **Painel ADM**", components: [row], ephemeral: true });
        }

        if (i.isButton()) {
            if (i.customId === 'ver_opc') {
                if (db.estoque.length === 0) return i.reply({ content: "❌ Estoque vazio!", ephemeral: true });
                const menu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('compra').setPlaceholder('🛒 Selecione...').addOptions(db.estoque.map((e, idx) => ({ label: e.nome, description: `R$ ${e.preco}`, value: `p_${idx}` }))));
                return i.reply({ content: "Selecione:", components: [menu], ephemeral: true });
            }
            if (i.customId === 'fechar') return i.channel.delete().catch(() => {});
            
            // Modais de Gerenciamento
            if (i.customId === 'g_msgs') {
                const modal = new ModalBuilder().setCustomId('m_m').setTitle('Textos');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mv').setLabel("Painel").setStyle(TextInputStyle.Paragraph).setValue(db.config.msgVendas)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ms').setLabel("Siglas").setStyle(TextInputStyle.Paragraph).setValue(db.config.siglas)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mt').setLabel("Ticket").setStyle(TextInputStyle.Paragraph).setValue(db.config.msgTicket))
                );
                return i.showModal(modal);
            }
            if (i.customId === 'g_add') {
                const modal = new ModalBuilder().setCustomId('m_a').setTitle('Add Produto');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n').setLabel("Nome").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p').setLabel("Preço").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q').setLabel("Estoque").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('d').setLabel("Descrição").setStyle(TextInputStyle.Paragraph))
                );
                return i.showModal(modal);
            }
            if (i.customId === 'g_loja') {
                const modal = new ModalBuilder().setCustomId('m_l').setTitle('Loja');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n').setLabel("Nome").setStyle(TextInputStyle.Short).setValue(db.config.nome)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p').setLabel("PIX").setStyle(TextInputStyle.Short).setValue(db.config.pix)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('b').setLabel("Banner").setStyle(TextInputStyle.Short).setValue(db.config.banner))
                );
                return i.showModal(modal);
            }
        }

        if (i.isModalSubmit()) {
            if (i.customId === 'm_m') {
                db.config.msgVendas = i.fields.getTextInputValue('mv');
                db.config.siglas = i.fields.getTextInputValue('ms');
                db.config.msgTicket = i.fields.getTextInputValue('mt');
                return i.reply({ content: "✅ Salvo!", ephemeral: true });
            }
            if (i.customId === 'm_a') {
                db.estoque.push({ nome: i.fields.getTextInputValue('n'), preco: i.fields.getTextInputValue('p'), qtd: i.fields.getTextInputValue('q'), desc: i.fields.getTextInputValue('d') });
                return i.reply({ content: "✅ Adicionado!", ephemeral: true });
            }
            if (i.customId === 'm_l') {
                db.config.nome = i.fields.getTextInputValue('n');
                db.config.pix = i.fields.getTextInputValue('p');
                db.config.banner = i.fields.getTextInputValue('b');
                return i.reply({ content: "✅ Configurado!", ephemeral: true });
            }
        }

        if (i.isStringSelectMenu() && i.customId === 'compra') {
            await i.deferReply({ ephemeral: true });
            const item = db.estoque[i.values[0].split('_')[1]];
            const canal = await i.guild.channels.create({
                name: `🛒-${i.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });
            const embed = new EmbedBuilder().setTitle("🛒 Pedido Aberto").setColor("#00ff6a").setDescription(`📦 **Produto:** ${item.nome}\n💰 **Preço:** R$ ${item.preco}\n📝 **Detalhes:** ${item.desc}\n\n🔑 **PIX:** \`${db.config.pix}\`\n\n${db.config.msgTicket}`);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fechar').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger));
            await canal.send({ content: `${i.user}`, embeds: [embed], components: [row] });
            return i.editReply({ content: `✅ Ticket: ${canal}` });
        }
    });

    try { await client.login(token); } catch (e) { console.log("Token Inválido"); }
}

// ROTAS WEB
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/ligar-bot', (req, res) => {
    const { token, nomeLoja, pix, banner } = req.body;
    db.config.nome = nomeLoja || db.config.nome;
    db.config.pix = pix || db.config.pix;
    db.config.banner = banner || db.config.banner;
    
    // Liga o bot sem fazer o site esperar o login (para não travar)
    iniciarBot(token).catch(console.error);
    
    res.status(200).send({ msg: "OK" });
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log(`🚀 Online na porta ${port}`));
