const express = require('express');
const path = require('path');
const { 
    Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, 
    PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder 
} = require('discord.js');

const app = express();
app.use(express.json());

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

// FUNÇÃO PARA REGISTRAR COMANDOS ESCALÁVEIS
async function registrarComandos(token, clientId) {
    const commands = [
        new SlashCommandBuilder()
            .setName('config-venda')
            .setDescription('Cria um novo painel de vendas neste canal')
            .addStringOption(opt => opt.setName('produto').setDescription('Nome do produto').setRequired(true))
            .addNumberOption(opt => opt.setName('preco').setDescription('Valor do produto').setRequired(true))
            .addStringOption(opt => opt.setName('descricao').setDescription('Descrição do que está sendo vendido').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('✅ Comandos de venda registrados!');
    } catch (error) {
        console.error('❌ Erro:', error);
    }
}

async function iniciarBot(token) {
    client.on('interactionCreate', async (i) => {
        // Comando para criar vários painéis
        if (i.isChatInputCommand() && i.commandName === 'config-venda') {
            const produto = i.options.getString('produto');
            const preco = i.options.getNumber('preco');
            const desc = i.options.getString('descricao');

            const embed = new EmbedBuilder()
                .setTitle(`📦 Loja Sirius | ${produto}`)
                .setDescription(`${desc}\n\n**💰 Valor:** \`R$ ${preco.toFixed(2)}\``)
                .setColor("#00ff6a")
                .setFooter({ text: "Clique no botão abaixo para comprar" });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`comprar_${produto}_${preco}`)
                    .setLabel('Comprar Agora')
                    .setEmoji('🛒')
                    .setStyle(ButtonStyle.Success)
            );

            await i.channel.send({ embeds: [embed], components: [row] });
            return i.reply({ content: "✅ Painel criado com sucesso!", ephemeral: true });
        }

        // Lógica do Carrinho de Compras
        if (i.isButton()) {
            if (i.customId.startsWith('comprar_')) {
                const [_, nomeProd, precoProd] = i.customId.split('_');
                
                // Criar canal de checkout privado
                const canal = await i.guild.channels.create({
                    name: `🛒-${i.user.username}`,
                    type: ChannelType.GuildText,
                    parent: i.channel.parentId,
                    permissionOverwrites: [
                        { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                    ]
                });

                const checkoutEmbed = new EmbedBuilder()
                    .setTitle("💳 Checkout Sirius")
                    .setDescription(`Olá ${i.user}, você iniciou a compra de:\n**${nomeProd}**\n\n**Total:** \`R$ ${precoProd}\`\n\nEscolha a forma de pagamento abaixo:`)
                    .setColor("#00ff6a");

                const botoesPgto = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('pagar_pix').setLabel('Pagar com PIX').setStyle(ButtonStyle.Primary).setEmoji('💎'),
                    new ButtonBuilder().setCustomId('cancelar_compra').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
                );

                await canal.send({ content: `${i.user}`, embeds: [checkoutEmbed], components: [botoesPgto] });
                await i.reply({ content: `✅ Carrinho aberto em ${canal}`, ephemeral: true });
            }

            if (i.customId === 'cancelar_compra') {
                await i.channel.send("❌ Cancelando pedido e fechando canal...");
                setTimeout(() => i.channel.delete().catch(() => {}), 3000);
            }
        }
    });

    await client.login(token);
    await registrarComandos(token, client.user.id);
}

// Servidor Web para Railway
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.post('/ligar-bot', async (req, res) => {
    try {
        await iniciarBot(req.body.token);
        res.send({ msg: "OK" });
    } catch (e) {
        res.send({ msg: "ERRO" });
    }
});
app.listen(process.env.PORT || 3000, '0.0.0.0');
